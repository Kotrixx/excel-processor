import * as ExcelJS from 'exceljs';

export interface ExcelData {
  [key: string]: any[];
}

export interface VulnerabilityData {
  [key: string]: any;
}

export interface ProcessingResult {
  success: boolean;
  data?: any[];
  error?: string;
  fileName?: string;
  rowCount?: number;
}

// Debug logger
export const logger = {
  info: (message: string, data?: any) => {
    console.log(`[INFO] ${message}`, data || '');
  },
  warn: (message: string, data?: any) => {
    console.warn(`[WARN] ${message}`, data || '');
  },
  error: (message: string, error?: any) => {
    console.error(`[ERROR] ${message}`, error || '');
  },
  debug: (message: string, data?: any) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DEBUG] ${message}`, data || '');
    }
  }
};

// Función para leer archivo CSV
export const readCSVFile = (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    logger.info(`Iniciando lectura de archivo CSV: ${file.name}`);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim());
        
        logger.debug(`Líneas encontradas en CSV: ${lines.length}`);
        
        if (lines.length < 2) {
          throw new Error('El archivo CSV debe tener al menos una fila de encabezados y una fila de datos');
        }

        // Parsear manualmente el CSV respetando las comillas
        const parseCSVLine = (line: string): string[] => {
          const result: string[] = [];
          let current = '';
          let inQuotes = false;
          
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];
            
            if (char === '"') {
              if (inQuotes && nextChar === '"') {
                current += '"';
                i++; // Skip next quote
              } else {
                inQuotes = !inQuotes;
              }
            } else if (char === ',' && !inQuotes) {
              result.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }
          result.push(current.trim());
          return result;
        };

        // Obtener encabezados
        const headers = parseCSVLine(lines[0]);
        logger.debug(`Headers encontrados: ${headers.length}`, headers);
        
        // Procesar filas de datos
        const data: any[] = [];
        for (let i = 1; i < lines.length; i++) {
          const values = parseCSVLine(lines[i]);
          if (values.length >= headers.length) {
            const row: any = {};
            headers.forEach((header, index) => {
              row[header] = values[index] || '';
            });
            data.push(row);
          }
        }
        
        logger.info(`CSV procesado exitosamente: ${data.length} filas`);
        resolve(data);
      } catch (error) {
        logger.error(`Error procesando CSV: ${file.name}`, error);
        reject(error);
      }
    };
    
    reader.onerror = () => {
      const error = new Error(`Error leyendo archivo: ${file.name}`);
      logger.error('Error del FileReader', error);
      reject(error);
    };
    
    reader.readAsText(file, 'utf-8');
  });
};

// Función para leer archivo Excel
export const readExcelFile = (file: File): Promise<ExcelData> => {
  return new Promise((resolve, reject) => {
    logger.info(`Iniciando lectura de archivo Excel: ${file.name}`);
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        
        const result: ExcelData = {};
        
        workbook.worksheets.forEach((worksheet, index) => {
          logger.debug(`Procesando hoja ${index + 1}: ${worksheet.name}`);
          
          const sheetData: any[] = [];
          const headers: string[] = [];
          
          // Obtener headers de la primera fila
          const headerRow = worksheet.getRow(1);
          headerRow.eachCell((cell, colNumber) => {
            headers[colNumber - 1] = cell.text || `Column${colNumber}`;
          });
          
          logger.debug(`Headers de la hoja ${worksheet.name}:`, headers);
          
          // Obtener datos de las filas restantes
          worksheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) { // Skip header row
              const rowData: any = {};
              row.eachCell((cell, colNumber) => {
                const header = headers[colNumber - 1];
                if (header) {
                  rowData[header] = cell.text || cell.value;
                }
              });
              if (Object.keys(rowData).length > 0) {
                sheetData.push(rowData);
              }
            }
          });
          
          result[worksheet.name] = sheetData;
          logger.debug(`Hoja ${worksheet.name} procesada: ${sheetData.length} filas`);
        });
        
        logger.info(`Excel procesado exitosamente: ${file.name}`);
        resolve(result);
      } catch (error) {
        logger.error(`Error procesando Excel: ${file.name}`, error);
        reject(error);
      }
    };
    
    reader.onerror = () => {
      const error = new Error(`Error leyendo archivo Excel: ${file.name}`);
      logger.error('Error del FileReader', error);
      reject(error);
    };
    
    reader.readAsArrayBuffer(file);
  });
};

// Función para detectar tipo de archivo y leer apropiadamente
export const readFile = async (file: File): Promise<any[]> => {
  const fileExtension = file.name.toLowerCase().split('.').pop();
  logger.info(`Detectado tipo de archivo: ${fileExtension} para ${file.name}`);
  
  if (fileExtension === 'csv') {
    return await readCSVFile(file);
  } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
    const excelData = await readExcelFile(file);
    // Tomar la primera hoja
    const firstSheetName = Object.keys(excelData)[0];
    logger.debug(`Usando primera hoja del Excel: ${firstSheetName}`);
    return excelData[firstSheetName];
  } else {
    const error = `Tipo de archivo no soportado: ${fileExtension}`;
    logger.error(error);
    throw new Error(error);
  }
};

// Función para descargar archivo Excel
export const downloadExcel = async (
  data: any[], 
  filename: string, 
  sheetName: string = 'Sheet1'
): Promise<void> => {
  logger.info(`Iniciando descarga de Excel: ${filename} con ${data.length} filas`);
  
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(sheetName);
    
    if (data.length > 0) {
      const headers = Object.keys(data[0]);
      logger.debug(`Headers para Excel:`, headers);
      
      worksheet.addRow(headers);
      
      data.forEach((row, index) => {
        const values = headers.map(header => row[header]);
        worksheet.addRow(values);
        
        // Log cada 1000 filas para archivos grandes
        if ((index + 1) % 1000 === 0) {
          logger.debug(`Procesadas ${index + 1} filas de ${data.length}`);
        }
      });
      
      // Estilo para headers
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };

      // Auto-ajustar ancho de columnas
      worksheet.columns.forEach((column, index) => {
        const header = headers[index];
        let maxLength = header ? header.length : 10;
        
        // Calcular ancho basado en contenido (muestra de primeras 100 filas)
        const sampleSize = Math.min(100, data.length);
        for (let i = 0; i < sampleSize; i++) {
          const cellValue = String(data[i][header] || '');
          maxLength = Math.max(maxLength, cellValue.length);
        }
        
        column.width = Math.min(Math.max(maxLength + 2, 10), 50);
      });
    }
    
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
    
    logger.info(`Descarga completada: ${filename}`);
  } catch (error) {
    logger.error(`Error en descarga de Excel: ${filename}`, error);
    throw error;
  }
};

// Función para validar columnas esperadas
export const validateVulnerabilityColumns = (data: any[]): { isValid: boolean; foundColumns: string[]; missingColumns: string[] } => {
  if (data.length === 0) {
    return { isValid: false, foundColumns: [], missingColumns: [] };
  }

  const expectedColumns = ['Source', 'Asset', 'Severity', 'Description', 'Fingerprint'];
  const availableColumns = Object.keys(data[0]);
  
  const foundColumns = expectedColumns.filter(col => 
    availableColumns.some(available => 
      available.toLowerCase().includes(col.toLowerCase())
    )
  );
  
  const missingColumns = expectedColumns.filter(col => !foundColumns.includes(col));
  
  logger.debug('Validación de columnas:', { foundColumns, missingColumns, availableColumns });
  
  return {
    isValid: foundColumns.length >= 3, // Al menos 3 columnas principales
    foundColumns,
    missingColumns
  };
};

// Función para encontrar columnas de identificación única
export const findUniqueColumns = (data: any[]): string[] => {
  if (data.length === 0) return [];
  
  const sampleRow = data[0];
  const priorityColumns = ['Fingerprint', 'fingerprint', 'CVE', 'cve', 'Detector', 'detector'];
  
  const foundColumns = Object.keys(sampleRow).filter(key => 
    key.toLowerCase().includes('cve') || 
    key.toLowerCase().includes('codigo') || 
    key.toLowerCase().includes('code') ||
    key.toLowerCase().includes('mgh') ||
    key.toLowerCase().includes('fingerprint') ||
    key.toLowerCase().includes('detector')
  );
  
  // Priorizar columnas importantes
  const sorted = foundColumns.sort((a, b) => {
    const aIndex = priorityColumns.findIndex(p => a.toLowerCase().includes(p.toLowerCase()));
    const bIndex = priorityColumns.findIndex(p => b.toLowerCase().includes(p.toLowerCase()));
    
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return 0;
  });
  
  logger.debug('Columnas únicas encontradas:', sorted);
  return sorted;
};

// Función para encontrar columnas comunes entre dos datasets
export const findCommonColumns = (data1: any[], data2: any[]): string[] => {
  if (data1.length === 0 || data2.length === 0) return [];
  
  const columns1 = Object.keys(data1[0]);
  const columns2 = Object.keys(data2[0]);
  
  const commonColumns = columns1.filter(col => columns2.includes(col));
  
  // Priorizar columnas de identificación únicas
  const priorityColumns = ['Fingerprint', 'fingerprint', 'Asset', 'asset', 'Source', 'source'];
  
  const sorted = commonColumns.sort((a, b) => {
    const aIndex = priorityColumns.findIndex(p => a.toLowerCase() === p.toLowerCase());
    const bIndex = priorityColumns.findIndex(p => b.toLowerCase() === p.toLowerCase());
    
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return a.localeCompare(b);
  });
  
  logger.debug('Columnas comunes encontradas:', sorted);
  return sorted;
};