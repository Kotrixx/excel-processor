'use client';

import { useState, useRef } from 'react';

export default function ConcatenatePage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [stats, setStats] = useState<{
    totalFiles: number;
    successfulFiles: number;
    failedFiles: string[];
    totalRows: number;
    validationResults: Array<{
      fileName: string;
      rowCount: number;
      validation: {
        isValid: boolean;
        foundColumns: string[];
        missingColumns: string[];
      };
    }>;
  } | null>(null);
  
  const filesRef = useRef<HTMLInputElement>(null);

  // Funciones utilitarias inline para evitar problemas de SSR
  const logger = {
    info: (message: string, data?: unknown) => {
      console.log(`[INFO] ${message}`, data || '');
    },
    warn: (message: string, data?: unknown) => {
      console.warn(`[WARN] ${message}`, data || '');
    },
    error: (message: string, error?: unknown) => {
      console.error(`[ERROR] ${message}`, error || '');
    },
    debug: (message: string, data?: unknown) => {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[DEBUG] ${message}`, data || '');
      }
    }
  };

  const validateVulnerabilityColumns = (data: Record<string, unknown>[]): { 
    isValid: boolean; 
    foundColumns: string[]; 
    missingColumns: string[] 
  } => {
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
    
    return {
      isValid: foundColumns.length >= 3,
      foundColumns,
      missingColumns
    };
  };

  const readFile = async (file: File): Promise<Record<string, unknown>[]> => {
    const fileExtension = file.name.toLowerCase().split('.').pop();
    
    if (fileExtension === 'csv') {
      return await readCSVFile(file);
    } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
      const ExcelJS = await import('exceljs');
      const excelData = await readExcelFile(file, ExcelJS.default);
      const firstSheetName = Object.keys(excelData)[0];
      return excelData[firstSheetName];
    } else {
      throw new Error(`Tipo de archivo no soportado: ${fileExtension}`);
    }
  };

  const readCSVFile = (file: File): Promise<Record<string, unknown>[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const lines = text.split('\n').filter(line => line.trim());
          
          if (lines.length < 2) {
            throw new Error('El archivo CSV debe tener al menos una fila de encabezados y una fila de datos');
          }

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
                  i++;
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

          const headers = parseCSVLine(lines[0]);
          const data: Record<string, unknown>[] = [];
          
          for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i]);
            if (values.length >= headers.length) {
              const row: Record<string, unknown> = {};
              headers.forEach((header, index) => {
                row[header] = values[index] || '';
              });
              data.push(row);
            }
          }
          
          resolve(data);
        } catch (error) {
          reject(error);
        }
      };
      reader.readAsText(file, 'utf-8');
    });
  };

  const readExcelFile = async (file: File, ExcelJS: any): Promise<{ [key: string]: Record<string, unknown>[] }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const buffer = e.target?.result as ArrayBuffer;
          const workbook = new ExcelJS.Workbook();
          await workbook.xlsx.load(buffer);
          
          const result: { [key: string]: Record<string, unknown>[] } = {};
          
          workbook.worksheets.forEach((worksheet: any) => {
            const sheetData: Record<string, unknown>[] = [];
            const headers: string[] = [];
            
            const headerRow = worksheet.getRow(1);
            headerRow.eachCell((cell: any, colNumber: number) => {
              headers[colNumber - 1] = cell.text || `Column${colNumber}`;
            });
            
            worksheet.eachRow((row: any, rowNumber: number) => {
              if (rowNumber > 1) {
                const rowData: Record<string, unknown> = {};
                row.eachCell((cell: any, colNumber: number) => {
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
          });
          
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  };

  const downloadExcel = async (
    data: Record<string, unknown>[], 
    filename: string, 
    sheetName: string = 'Sheet1'
  ): Promise<void> => {
    try {
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.default.Workbook();
      const worksheet = workbook.addWorksheet(sheetName);
      
      if (data.length > 0) {
        const headers = Object.keys(data[0]);
        worksheet.addRow(headers);
        
        data.forEach((row) => {
          const values = headers.map(header => row[header]);
          worksheet.addRow(values);
        });
        
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true };
        headerRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE0E0E0' }
        };

        worksheet.columns.forEach((column: any, index: number) => {
          const header = headers[index];
          let maxLength = header ? header.length : 10;
          
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
    } catch (error) {
      throw error;
    }
  };

  const handleConcatenateFiles = async () => {
    if (!filesRef.current?.files?.length) {
      setMessage('Por favor selecciona al menos un archivo CSV o Excel');
      return;
    }

    setLoading(true);
    setMessage('');
    setStats(null);

    try {
      const files = Array.from(filesRef.current.files);
      const allData: any[] = [];
      let successfulFiles = 0;
      let failedFiles: string[] = [];
      const validationResults: any[] = [];

      logger.info(`Iniciando concatenación de ${files.length} archivos`);

      for (const file of files) {
        try {
          logger.info(`Procesando archivo: ${file.name}`);
          const fileData = await readFile(file);
          
          // Validar columnas esperadas
          const validation = validateVulnerabilityColumns(fileData);
          validationResults.push({
            fileName: file.name,
            rowCount: fileData.length,
            validation
          });
          
          if (!validation.isValid) {
            logger.warn(`Archivo ${file.name} no tiene las columnas esperadas pero se procesará`, validation);
          }
          
          // Agregar información del archivo origen
          const dataWithSource = fileData.map((row, index) => ({
            ...row,
            _source_file: file.name,
            _file_type: file.name.toLowerCase().split('.').pop(),
            _row_number: index + 1,
            _processed_at: new Date().toISOString()
          }));
          
          allData.push(...dataWithSource);
          successfulFiles++;
          
          logger.info(`Archivo ${file.name} procesado: ${fileData.length} filas`);
        } catch (error) {
          logger.error(`Error procesando ${file.name}`, error);
          failedFiles.push(file.name);
        }
      }

      if (allData.length === 0) {
        setMessage('❌ No se pudieron procesar ninguno de los archivos');
        return;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `vulnerabilidades_concatenadas_${timestamp}.xlsx`;
      
      await downloadExcel(allData, filename, 'Vulnerabilidades_Combinadas');
      
      // Actualizar estadísticas
      setStats({
        totalFiles: files.length,
        successfulFiles,
        failedFiles,
        totalRows: allData.length,
        validationResults
      });
      
      let successMessage = `✅ Se concatenaron ${successfulFiles} archivos con ${allData.length} filas totales`;
      if (failedFiles.length > 0) {
        successMessage += `\n⚠️ Archivos que fallaron: ${failedFiles.join(', ')}`;
      }
      
      setMessage(successMessage);
      logger.info('Concatenación completada exitosamente');
    } catch (error) {
      logger.error('Error en concatenación', error);
      setMessage(`❌ Error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    if (filesRef.current) {
      filesRef.current.value = '';
    }
    setMessage('');
    setStats(null);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Concatenar Múltiples Archivos</h1>
          <p className="text-gray-600">
            Combina múltiples archivos CSV o Excel de vulnerabilidades en un solo archivo Excel. 
            Se agregará información de trazabilidad para identificar el origen de cada fila.
          </p>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Seleccionar archivos CSV o Excel:
            </label>
            <input
              ref={filesRef}
              type="file"
              multiple
              accept=".csv,.xlsx,.xls"
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              onChange={() => setMessage('')}
            />
            <p className="text-sm text-gray-500 mt-1">
              Puedes seleccionar múltiples archivos. Se soportan formatos CSV, Excel (.xlsx, .xls)
            </p>
          </div>

          <div className="flex space-x-4">
            <button
              onClick={handleConcatenateFiles}
              disabled={loading}
              className={`
                flex-1 py-3 px-6 rounded-lg font-medium transition-colors text-white
                ${loading 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-blue-500 hover:bg-blue-600'}
              `}
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Procesando...
                </span>
              ) : (
                'Concatenar y Descargar Excel'
              )}
            </button>

            <button
              onClick={resetForm}
              disabled={loading}
              className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium"
            >
              Limpiar
            </button>
          </div>
        </div>

        {/* Mensaje de estado */}
        {message && (
          <div className={`mt-6 p-4 rounded-lg ${
            message.includes('✅') 
              ? 'bg-green-100 border border-green-200 text-green-700' 
              : 'bg-red-100 border border-red-200 text-red-700'
          }`}>
            <pre className="whitespace-pre-wrap">{message}</pre>
          </div>
        )}

        {/* Estadísticas detalladas */}
        {stats && (
          <div className="mt-6 bg-gray-50 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">📊 Estadísticas de Procesamiento</h3>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white p-4 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{stats.totalFiles}</div>
                <div className="text-sm text-gray-600">Archivos Total</div>
              </div>
              <div className="bg-white p-4 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{stats.successfulFiles}</div>
                <div className="text-sm text-gray-600">Exitosos</div>
              </div>
              <div className="bg-white p-4 rounded-lg">
                <div className="text-2xl font-bold text-red-600">{stats.failedFiles.length}</div>
                <div className="text-sm text-gray-600">Fallidos</div>
              </div>
              <div className="bg-white p-4 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">{stats.totalRows}</div>
                <div className="text-sm text-gray-600">Filas Total</div>
              </div>
            </div>

            {/* Detalles por archivo */}
            <div className="space-y-3">
              <h4 className="font-medium text-gray-900">Detalles por Archivo:</h4>
              {stats.validationResults.map((result, index) => (
                <div key={index} className="bg-white p-4 rounded border-l-4 border-l-blue-500">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium text-gray-900">{result.fileName}</div>
                      <div className="text-sm text-gray-600">{result.rowCount} filas procesadas</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-medium ${
                        result.validation.isValid ? 'text-green-600' : 'text-yellow-600'
                      }`}>
                        {result.validation.isValid ? '✓ Válido' : '⚠ Advertencia'}
                      </div>
                      <div className="text-xs text-gray-500">
                        {result.validation.foundColumns.length} columnas reconocidas
                      </div>
                    </div>
                  </div>
                  
                  {!result.validation.isValid && (
                    <div className="mt-2 text-xs text-gray-600">
                      <div>Encontradas: {result.validation.foundColumns.join(', ')}</div>
                      {result.validation.missingColumns.length > 0 && (
                        <div>Faltantes: {result.validation.missingColumns.join(', ')}</div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {stats.failedFiles.length > 0 && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <h4 className="font-medium text-red-900 mb-2">❌ Archivos que fallaron:</h4>
                <ul className="text-sm text-red-700 space-y-1">
                  {stats.failedFiles.map((fileName, index) => (
                    <li key={index}>• {fileName}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Información de ayuda */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-3">💡 Información de Uso</h3>
          <div className="text-sm text-blue-800 space-y-2">
            <p><strong>Columnas agregadas automáticamente:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li><code>_source_file</code>: Nombre del archivo de origen</li>
              <li><code>_file_type</code>: Tipo de archivo (csv, xlsx, xls)</li>
              <li><code>_row_number</code>: Número de fila dentro del archivo original</li>
              <li><code>_processed_at</code>: Timestamp de cuando fue procesado</li>
            </ul>
            <p className="mt-3"><strong>Formato de salida:</strong> Excel (.xlsx) con headers formateados y columnas auto-ajustadas</p>
          </div>
        </div>
      </div>
    </div>
  );
}