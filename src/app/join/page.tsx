'use client';

import { useState, useRef } from 'react';

export default function JoinPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [stats, setStats] = useState<{
    file1Name: string;
    file2Name: string;
    file1Rows: number;
    file2Rows: number;
    joinColumn: string;
    matchedRows: number;
    unmatchedRows: number;
    totalOutputRows: number;
    commonColumns: string[];
    file1OnlyColumns: string[];
    file2OnlyColumns: string[];
  } | null>(null);
  
  const file1Ref = useRef<HTMLInputElement>(null);
  const file2Ref = useRef<HTMLInputElement>(null);

  // Logger inline
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

  // Funciones de utilidad inline
  const readFile = async (file: File): Promise<Record<string, unknown>[]> => {
    const fileExtension = file.name.toLowerCase().split('.').pop();
    
    if (fileExtension === 'csv') {
      return await readCSVFile(file);
    } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
      const ExcelJS = await import('exceljs');
      const excelData = await readExcelFile(file, ExcelJS);
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

  const readExcelFile = async (file: File, ExcelJS: typeof import('exceljs')): Promise<{ [key: string]: Record<string, unknown>[] }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const buffer = e.target?.result as ArrayBuffer;
          const workbook = new ExcelJS.Workbook();
          await workbook.xlsx.load(buffer);
          
          const result: { [key: string]: Record<string, unknown>[] } = {};
          
          workbook.worksheets.forEach((worksheet) => {
            const sheetData: Record<string, unknown>[] = [];
            const headers: string[] = [];
            
            const headerRow = worksheet.getRow(1);
            headerRow.eachCell((cell, colNumber) => {
              headers[colNumber - 1] = cell.text || `Column${colNumber}`;
            });
            
            worksheet.eachRow((row, rowNumber) => {
              if (rowNumber > 1) {
                const rowData: Record<string, unknown> = {};
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
      const workbook = new ExcelJS.Workbook();
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

        worksheet.columns.forEach((column, index) => {
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

  // Función para encontrar columnas comunes priorizando Detector
  const findCommonColumns = (data1: Record<string, unknown>[], data2: Record<string, unknown>[]): string[] => {
    if (data1.length === 0 || data2.length === 0) return [];
    
    const columns1 = Object.keys(data1[0]);
    const columns2 = Object.keys(data2[0]);
    
    const commonColumns = columns1.filter(col => columns2.includes(col));
    
    // Priorizar columnas de identificación únicas, especialmente Detector
    const priorityColumns = [
      'Detector', 'detector', 
      'Fingerprint', 'fingerprint', 
      'Asset', 'asset', 
      'Source', 'source',
      'URI', 'uri'
    ];
    
    const sorted = commonColumns.sort((a, b) => {
      const aIndex = priorityColumns.findIndex(p => a.toLowerCase() === p.toLowerCase());
      const bIndex = priorityColumns.findIndex(p => b.toLowerCase() === p.toLowerCase());
      
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return a.localeCompare(b);
    });
    
    logger.debug('Columnas comunes encontradas (priorizando Detector):', sorted);
    return sorted;
  };

  const handleJoinFiles = async () => {
    if (!file1Ref.current?.files?.[0] || !file2Ref.current?.files?.[0]) {
      setMessage('Por favor selecciona ambos archivos CSV o Excel');
      return;
    }

    setLoading(true);
    setMessage('');
    setStats(null);

    try {
      const file1 = file1Ref.current.files[0]; // Archivo principal (a enriquecer)
      const file2 = file2Ref.current.files[0]; // Archivo con datos adicionales

      logger.info(`Iniciando JOIN: ${file1.name} (principal) + ${file2.name} (datos adicionales)`);

      const [data1, data2] = await Promise.all([
        readFile(file1),
        readFile(file2)
      ]);

      if (data1.length === 0 || data2.length === 0) {
        setMessage('❌ Uno o ambos archivos están vacíos');
        return;
      }

      logger.info(`Archivos cargados: ${data1.length} filas (archivo 1), ${data2.length} filas (archivo 2)`);

      const columns1 = Object.keys(data1[0]);
      const columns2 = Object.keys(data2[0]);
      
      const commonColumns = findCommonColumns(data1, data2);
      
      if (commonColumns.length === 0) {
        setMessage('❌ No se encontraron columnas en común entre los archivos');
        logger.warn('Columnas archivo 1:', columns1);
        logger.warn('Columnas archivo 2:', columns2);
        return;
      }

      // Buscar específicamente la columna Detector primero
      let joinColumn = commonColumns.find(col => 
        col.toLowerCase() === 'detector' || col === 'Detector'
      );
      
      // Si no hay Detector, usar la primera columna común (ya está priorizada)
      if (!joinColumn) {
        joinColumn = commonColumns[0];
      }
      
      logger.info(`Usando columna para JOIN: ${joinColumn}`);
      
      // Crear índice del segundo archivo para búsqueda rápida por Detector
      const data2Index = new Map<string, Record<string, unknown>>();
      const duplicatesInFile2 = new Map<string, number>();
      
      data2.forEach((row, index) => {
        const key = String(row[joinColumn] || '').trim();
        if (key && key !== 'undefined' && key !== 'null' && key !== '') {
          if (data2Index.has(key)) {
            // Contar duplicados en archivo 2
            duplicatesInFile2.set(key, (duplicatesInFile2.get(key) || 1) + 1);
            logger.warn(`Detector duplicado en archivo 2: ${key}`);
          } else {
            data2Index.set(key, { 
              ...row, 
              _source_row_file2: index + 1,
              _source_file2: file2.name 
            });
          }
        }
      });

      logger.info(`Índice creado: ${data2Index.size} detectores únicos en archivo 2`);
      if (duplicatesInFile2.size > 0) {
        logger.warn(`Detectores duplicados en archivo 2: ${Array.from(duplicatesInFile2.keys()).join(', ')}`);
      }

      // Realizar LEFT JOIN basado en Detector
      let matchedCount = 0;
      const joinedData = data1.map((row1, index) => {
        const detectorKey = String(row1[joinColumn] || '').trim();
        const row2 = data2Index.get(detectorKey);
        
        if (row2) {
          // MATCH: Combinar datos del archivo 2 con archivo 1
          // El archivo 1 tiene prioridad en caso de columnas duplicadas
          const combined = { 
            ...row2,  // Datos del archivo 2 primero
            ...row1   // Datos del archivo 1 con prioridad
          };
          
          // Agregar metadatos del join
          combined._join_status = 'matched';
          combined._join_key = detectorKey;
          combined._file1_row = index + 1;
          combined._file1_name = file1.name;
          combined._matched_detector = detectorKey;
          
          matchedCount++;
          return combined;
        } else {
          // NO MATCH: Solo datos del archivo 1
          const result = { ...row1 };
          result._join_status = 'no_match';
          result._join_key = detectorKey;
          result._file1_row = index + 1;
          result._file1_name = file1.name;
          result._unmatched_detector = detectorKey;
          
          return result;
        }
      });

      const unmatchedCount = data1.length - matchedCount;

      // Agregar información sobre detectores que están en archivo 2 pero no en archivo 1
      const detectorsInFile1 = new Set(data1.map(row => String(row[joinColumn] || '').trim()));
      const unmatchedInFile2 = Array.from(data2Index.keys()).filter(detector => !detectorsInFile1.has(detector));
      
      if (unmatchedInFile2.length > 0) {
        logger.info(`Detectores en archivo 2 que NO están en archivo 1: ${unmatchedInFile2.join(', ')}`);
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `join_por_detector_${timestamp}.xlsx`;
      
      await downloadExcel(joinedData, filename, 'Datos_Unidos_Por_Detector');
      
      // Calcular columnas exclusivas
      const file1OnlyColumns = columns1.filter(col => !columns2.includes(col));
      const file2OnlyColumns = columns2.filter(col => !columns1.includes(col));

      setStats({
        file1Name: file1.name,
        file2Name: file2.name,
        file1Rows: data1.length,
        file2Rows: data2.length,
        joinColumn,
        matchedRows: matchedCount,
        unmatchedRows: unmatchedCount,
        totalOutputRows: joinedData.length,
        commonColumns,
        file1OnlyColumns,
        file2OnlyColumns
      });

      let resultMessage = `✅ JOIN completado usando la columna "${joinColumn}"!\n`;
      resultMessage += `📊 ${matchedCount} coincidencias de ${data1.length} filas del archivo principal\n`;
      
      if (unmatchedCount > 0) {
        resultMessage += `⚠️ ${unmatchedCount} filas sin coincidencia (se mantuvieron del archivo principal)\n`;
      }
      
      if (duplicatesInFile2.size > 0) {
        resultMessage += `🔄 ${duplicatesInFile2.size} detectores duplicados en archivo 2 (se usó la primera ocurrencia)\n`;
      }
      
      if (unmatchedInFile2.length > 0) {
        resultMessage += `📝 ${unmatchedInFile2.length} detectores en archivo 2 que no están en archivo 1`;
      }

      setMessage(resultMessage);
      logger.info(`JOIN completado: ${matchedCount} coincidencias de ${data1.length} filas`);
      
    } catch (error) {
      logger.error('Error en JOIN de archivos', error);
      setMessage(`❌ Error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    if (file1Ref.current) file1Ref.current.value = '';
    if (file2Ref.current) file2Ref.current.value = '';
    setMessage('');
    setStats(null);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Unir Archivos por Detector (Left Join)</h1>
          <p className="text-gray-600">
            Une dos archivos basándose en la columna <strong>Detector</strong>. Por cada detector que coincida entre ambos archivos, 
            se combinará la información del segundo archivo con el primero. El archivo principal mantiene todas sus filas, 
            y se enriquece con datos adicionales donde hay coincidencias de detectores.
          </p>
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>💡 Ejemplo:</strong> Si archivo1 tiene detector1 en 5 filas y archivo2 tiene detector1 con información adicional, 
              esas 5 filas del archivo1 se enriquecerán con los datos del archivo2.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                📄 Archivo principal (a enriquecer):
              </label>
              <input
                ref={file1Ref}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                onChange={() => setMessage('')}
              />
              <p className="text-xs text-gray-500 mt-1">
                Este archivo mantiene todas sus filas. Debe tener columna <strong>Detector</strong>.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                📋 Archivo con datos adicionales:
              </label>
              <input
                ref={file2Ref}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                onChange={() => setMessage('')}
              />
              <p className="text-xs text-gray-500 mt-1">
                Los datos de este archivo se agregarán al principal donde coincida el <strong>Detector</strong>.
              </p>
            </div>
          </div>

          <div className="flex space-x-4">
            <button
              onClick={handleJoinFiles}
              disabled={loading}
              className={`
                flex-1 py-3 px-6 rounded-lg font-medium transition-colors text-white
                ${loading 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-purple-500 hover:bg-purple-600'}
              `}
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Uniendo archivos...
                </span>
              ) : (
                'Unir Archivos y Descargar Excel'
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
            <h3 className="text-lg font-semibold text-gray-900 mb-4">📊 Resultados del Join</h3>
            
            {/* Resumen de archivos */}
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div className="bg-white p-4 rounded-lg border-l-4 border-l-blue-500">
                <h4 className="font-medium text-gray-900">{stats.file1Name}</h4>
                <div className="text-sm text-gray-600">Archivo principal: {stats.file1Rows} filas</div>
              </div>
              <div className="bg-white p-4 rounded-lg border-l-4 border-l-green-500">
                <h4 className="font-medium text-gray-900">{stats.file2Name}</h4>
                <div className="text-sm text-gray-600">Datos adicionales: {stats.file2Rows} filas</div>
              </div>
            </div>

            {/* Métricas del JOIN */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white p-4 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{stats.matchedRows}</div>
                <div className="text-sm text-gray-600">Coincidencias</div>
              </div>
              <div className="bg-white p-4 rounded-lg">
                <div className="text-2xl font-bold text-yellow-600">{stats.unmatchedRows}</div>
                <div className="text-sm text-gray-600">Sin coincidencia</div>
              </div>
              <div className="bg-white p-4 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{stats.totalOutputRows}</div>
                <div className="text-sm text-gray-600">Filas salida</div>
              </div>
              <div className="bg-white p-4 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">
                  {Math.round((stats.matchedRows / stats.file1Rows) * 100)}%
                </div>
                <div className="text-sm text-gray-600">Éxito JOIN</div>
              </div>
            </div>

            {/* Información de la columna JOIN */}
            <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <div className="text-sm font-medium text-purple-900">
                Columna utilizada para JOIN: <code className="bg-purple-100 px-2 py-1 rounded">{stats.joinColumn}</code>
              </div>
              <div className="text-xs text-purple-700 mt-1">
                Se priorizaron automáticamente las columnas de identificación única
              </div>
            </div>

            {/* Análisis de columnas */}
            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-white p-4 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">🔗 Columnas Comunes</h4>
                <div className="text-sm text-gray-600">
                  {stats.commonColumns.length > 0 ? (
                    <div className="space-y-1">
                      {stats.commonColumns.map((col, idx) => (
                        <div key={idx} className={`${col === stats.joinColumn ? 'font-semibold text-purple-700' : ''}`}>
                          {col === stats.joinColumn && '→ '}{col}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-gray-400">Ninguna</div>
                  )}
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">📄 Solo en Archivo 1</h4>
                <div className="text-sm text-gray-600">
                  {stats.file1OnlyColumns.length > 0 ? (
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {stats.file1OnlyColumns.map((col, idx) => (
                        <div key={idx}>{col}</div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-gray-400">Ninguna</div>
                  )}
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">📋 Solo en Archivo 2</h4>
                <div className="text-sm text-gray-600">
                  {stats.file2OnlyColumns.length > 0 ? (
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {stats.file2OnlyColumns.map((col, idx) => (
                        <div key={idx}>{col}</div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-gray-400">Ninguna</div>
                  )}
                </div>
              </div>
            </div>

            {/* Advertencias si es necesario */}
            {stats.unmatchedRows > 0 && (
              <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <h4 className="font-medium text-yellow-900 mb-2">⚠️ Filas sin coincidencia</h4>
                <p className="text-sm text-yellow-800">
                  {stats.unmatchedRows} filas del archivo principal no encontraron coincidencias en el archivo de datos adicionales. 
                  Estas filas se mantuvieron en el resultado con sus datos originales.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Información de ayuda */}
        <div className="mt-8 bg-purple-50 border border-purple-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-purple-900 mb-3">💡 Información de Uso - JOIN por Detector</h3>
          <div className="text-sm text-purple-800 space-y-2">
            <p><strong>Prioridad de columnas para JOIN:</strong></p>
            <ol className="list-decimal list-inside space-y-1 ml-4">
              <li><code>Detector</code> - PRIORIDAD PRINCIPAL para vulnerabilidades</li>
              <li><code>Fingerprint</code> - Identificador único alternativo</li>
              <li><code>Asset</code> - Identificador de activo</li>
              <li><code>Source</code> - Origen de la vulnerabilidad</li>
              <li>Otras columnas comunes por orden alfabético</li>
            </ol>
            
            <div className="mt-4 p-3 bg-purple-100 rounded">
              <p><strong>🔄 Proceso de JOIN:</strong></p>
              <ol className="list-decimal list-inside space-y-1 ml-2 text-xs">
                <li>Se busca la columna <code>Detector</code> en ambos archivos</li>
                <li>Por cada fila del archivo principal, se busca el mismo detector en archivo adicional</li>
                <li>Si hay coincidencia: se combinan los datos (archivo principal tiene prioridad)</li>
                <li>Si no hay coincidencia: se mantiene solo los datos del archivo principal</li>
                <li>Se agregan metadatos del proceso de JOIN</li>
              </ol>
            </div>
            
            <p className="mt-3"><strong>Metadatos agregados al resultado:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-4 text-xs">
              <li><code>_join_status</code>: &apos;matched&apos; o &apos;no_match&apos;</li>
              <li><code>_file1_row</code>: Número de fila en archivo principal</li>
              <li><code>_file1_name</code>: Nombre del archivo principal</li>
              <li><code>_matched_detector</code>: Detector que tuvo coincidencia (solo si matched)</li>
              <li><code>_unmatched_detector</code>: Detector sin coincidencia (solo si no_match)</li>
            </ul>
            
            <div className="mt-4 p-3 bg-yellow-100 border border-yellow-300 rounded">
              <p className="text-yellow-800"><strong>⚠️ Consideraciones importantes:</strong></p>
              <ul className="list-disc list-inside space-y-1 ml-2 text-xs text-yellow-700">
                <li>Si hay detectores duplicados en archivo 2, se usa la primera ocurrencia</li>
                <li>El archivo principal mantiene TODAS sus filas (LEFT JOIN)</li>
                <li>En caso de columnas duplicadas, el archivo principal tiene prioridad</li>
                <li>Se reportan detectores que están en archivo 2 pero no en archivo 1</li>
              </ul>
            </div>
            
            <p className="mt-3"><strong>Comportamiento:</strong> LEFT JOIN completo - todas las filas del archivo principal se preservan</p>
          </div>
        </div>
      </div>
    </div>
  );
}