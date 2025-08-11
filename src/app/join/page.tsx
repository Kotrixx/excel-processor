'use client';

import { useState, useRef } from 'react';

interface JoinStats {
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
  duplicatesInFile2: number;
  unmatchedInFile2: number;
  processingTime: number;
}

export default function ExcelMergerPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [stats, setStats] = useState<JoinStats | null>(null);
  
  const baseFileRef = useRef<HTMLInputElement>(null);
  const referenceFileRef = useRef<HTMLInputElement>(null);

  // Logger mejorado
  const logger = {
    info: (message: string, data?: unknown) => {
      console.log(`[INFO] ${new Date().toISOString()} ${message}`, data || '');
    },
    warn: (message: string, data?: unknown) => {
      console.warn(`[WARN] ${new Date().toISOString()} ${message}`, data || '');
    },
    error: (message: string, error?: unknown) => {
      console.error(`[ERROR] ${new Date().toISOString()} ${message}`, error || '');
    },
    debug: (message: string, data?: unknown) => {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[DEBUG] ${new Date().toISOString()} ${message}`, data || '');
      }
    }
  };

  // Función mejorada para leer archivos
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

          const headers = parseCSVLine(lines[0]).map(h => h.trim());
          const data: Record<string, unknown>[] = [];
          
          for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i]);
            if (values.length >= headers.length) {
              const row: Record<string, unknown> = {};
              headers.forEach((header, index) => {
                row[header] = values[index]?.trim() || '';
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
              headers[colNumber - 1] = (cell.text || `Column${colNumber}`).trim();
            });
            
            worksheet.eachRow((row, rowNumber) => {
              if (rowNumber > 1) {
                const rowData: Record<string, unknown> = {};
                row.eachCell((cell, colNumber) => {
                  const header = headers[colNumber - 1];
                  if (header) {
                    const cellValue = cell.text || cell.value;
                    rowData[header] = typeof cellValue === 'string' ? cellValue.trim() : cellValue;
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
    sheetName: string = 'Datos_Combinados'
  ): Promise<void> => {
    try {
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(sheetName);
      
      if (data.length > 0) {
        // Orden específico de columnas como especificaste
        const desiredOrder = [
          'Source', 'Asset Team', 'Asset Name', 'Asset Type', 'URI', 
          'Detector', 'Severity', 'Description', 'Version', 'Actual', 
          'Remediacion', 'Fuente', 'Content Class', 'Exposure window', 
          'Ignored', 'Line start', 'Line end'
        ];
        
        // Obtener todas las columnas del primer registro
        const allColumns = Object.keys(data[0]);
        
        // Crear el orden final: columnas deseadas primero, luego el resto
        const finalOrder = [
          ...desiredOrder.filter(col => allColumns.includes(col)),
          ...allColumns.filter(col => !desiredOrder.includes(col))
        ];
        
        worksheet.addRow(finalOrder);
        
        data.forEach((row) => {
          const values = finalOrder.map(header => row[header] || '');
          worksheet.addRow(values);
        });
        
        // Formatear encabezados
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true };
        headerRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4F81BD' }
        };
        
        // Ajustar ancho de columnas
        worksheet.columns.forEach((column, index) => {
          const header = finalOrder[index];
          let maxLength = header ? header.length : 10;
          
          const sampleSize = Math.min(100, data.length);
          for (let i = 0; i < sampleSize; i++) {
            const cellValue = String(data[i][header] || '');
            maxLength = Math.max(maxLength, cellValue.length);
          }
          
          column.width = Math.min(Math.max(maxLength + 2, 10), 50);
        });

        // Congelar primera fila
        worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
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

  // Función para encontrar la columna Detector (prioridad absoluta)
  const findJoinColumn = (data1: Record<string, unknown>[], data2: Record<string, unknown>[]): string | null => {
    if (data1.length === 0 || data2.length === 0) return null;
    
    const columns1 = Object.keys(data1[0]);
    const columns2 = Object.keys(data2[0]);
    
    // Buscar específicamente "Detector" (case-sensitive primero)
    if (columns1.includes('Detector') && columns2.includes('Detector')) {
      return 'Detector';
    }
    
    // Buscar "detector" en cualquier case
    const detectorCol1 = columns1.find(col => col.toLowerCase() === 'detector');
    const detectorCol2 = columns2.find(col => col.toLowerCase() === 'detector');
    
    if (detectorCol1 && detectorCol2 && detectorCol1 === detectorCol2) {
      return detectorCol1;
    }
    
    return null;
  };

  const handleCombineFiles = async () => {
    if (!baseFileRef.current?.files?.[0] || !referenceFileRef.current?.files?.[0]) {
      setMessage('❌ Por favor selecciona ambos archivos CSV o Excel');
      return;
    }

    setLoading(true);
    setMessage('Procesando archivos...');
    setStats(null);

    const startTime = Date.now();

    try {
      const baseFile = baseFileRef.current.files[0]; // Archivo base (principal)
      const refFile = referenceFileRef.current.files[0]; // Archivo de referencia

      logger.info(`Iniciando combinación: ${baseFile.name} (base) + ${refFile.name} (referencia)`);

      const [baseData, refData] = await Promise.all([
        readFile(baseFile),
        readFile(refFile)
      ]);

      if (baseData.length === 0 || refData.length === 0) {
        setMessage('❌ Uno o ambos archivos están vacíos');
        return;
      }

      logger.info(`Archivos cargados: ${baseData.length} filas (base), ${refData.length} filas (referencia)`);

      // Buscar la columna Detector
      const joinColumn = findJoinColumn(baseData, refData);
      
      if (!joinColumn) {
        const baseCols = Object.keys(baseData[0]);
        const refCols = Object.keys(refData[0]);
        setMessage(`❌ No se encontró la columna 'Detector' en ambos archivos.
        
Columnas en archivo base: ${baseCols.join(', ')}
Columnas en archivo referencia: ${refCols.join(', ')}

Asegúrate de que ambos archivos tengan una columna llamada 'Detector'.`);
        return;
      }

      logger.info(`Usando columna '${joinColumn}' para la combinación`);
      
      // Crear índice del archivo de referencia
      const refIndex = new Map<string, Record<string, unknown>>();
      const duplicatesInRef = new Set<string>();
      const seenKeys = new Set<string>();
      
      refData.forEach((row, index) => {
        const key = String(row[joinColumn] || '').trim();
        if (key && key !== 'undefined' && key !== 'null' && key !== '') {
          if (seenKeys.has(key)) {
            duplicatesInRef.add(key);
            logger.warn(`Detector duplicado en archivo referencia: ${key}`);
          } else {
            seenKeys.add(key);
            refIndex.set(key, { 
              ...row, 
              _ref_row: index + 1,
              _ref_file: refFile.name 
            });
          }
        }
      });

      logger.info(`Índice creado: ${refIndex.size} detectores únicos en archivo referencia`);
      
      // Realizar la combinación (LEFT JOIN del archivo base con referencia)
      let matchedCount = 0;
      const combinedData = baseData.map((baseRow, index) => {
        const detectorKey = String(baseRow[joinColumn] || '').trim();
        const refRow = refIndex.get(detectorKey);
        
        if (refRow) {
          // MATCH: Combinar información adicional del archivo de referencia
          const combined = { ...baseRow }; // Comenzar con datos base
          
          // Agregar solo las columnas específicas del archivo de referencia
          if (refRow['Version']) combined['Version'] = refRow['Version'];
          if (refRow['Actual']) combined['Actual'] = refRow['Actual'];
          if (refRow['Remediacion']) combined['Remediacion'] = refRow['Remediacion'];
          if (refRow['Fuente']) combined['Fuente'] = refRow['Fuente'];
          
          // Metadatos
          combined._match_status = 'matched';
          combined._base_row = index + 1;
          combined._ref_row = refRow._ref_row;
          
          matchedCount++;
          return combined;
        } else {
          // NO MATCH: Solo datos del archivo base
          const result = { ...baseRow };
          result._match_status = 'no_match';
          result._base_row = index + 1;
          result._unmatched_detector = detectorKey;
          
          return result;
        }
      });

      const unmatchedCount = baseData.length - matchedCount;

      // Detectores en referencia que no están en base
      const detectorsInBase = new Set(baseData.map(row => String(row[joinColumn] || '').trim()));
      const unmatchedInRef = Array.from(refIndex.keys()).filter(detector => !detectorsInBase.has(detector));

      if (unmatchedInRef.length > 0) {
        logger.info(`Detectores en referencia que NO están en base: ${unmatchedInRef.slice(0, 10).join(', ')}${unmatchedInRef.length > 10 ? '...' : ''}`);
      }

      // Generar archivo
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `excel_combinado_${timestamp}.xlsx`;
      
      await downloadExcel(combinedData, filename, 'Datos_Combinados');
      
      const processingTime = Date.now() - startTime;
      
      // Calcular estadísticas
      const baseCols = Object.keys(baseData[0]);
      const refCols = Object.keys(refData[0]);
      const commonColumns = baseCols.filter(col => refCols.includes(col));
      const file1OnlyColumns = baseCols.filter(col => !refCols.includes(col));
      const file2OnlyColumns = refCols.filter(col => !baseCols.includes(col));

      setStats({
        file1Name: baseFile.name,
        file2Name: refFile.name,
        file1Rows: baseData.length,
        file2Rows: refData.length,
        joinColumn,
        matchedRows: matchedCount,
        unmatchedRows: unmatchedCount,
        totalOutputRows: combinedData.length,
        commonColumns,
        file1OnlyColumns,
        file2OnlyColumns,
        duplicatesInFile2: duplicatesInRef.size,
        unmatchedInFile2: unmatchedInRef.length,
        processingTime
      });

      let resultMessage = `✅ Combinación completada exitosamente!\n`;
      resultMessage += `📊 ${matchedCount} coincidencias de ${baseData.length} registros del archivo base\n`;
      resultMessage += `⏱️ Procesado en ${Math.round(processingTime / 1000 * 100) / 100} segundos\n`;
      
      if (unmatchedCount > 0) {
        resultMessage += `⚠️ ${unmatchedCount} registros sin coincidencia (se mantuvieron del archivo base)\n`;
      }
      
      if (duplicatesInRef.size > 0) {
        resultMessage += `🔄 ${duplicatesInRef.size} detectores duplicados en archivo referencia (se usó la primera ocurrencia)\n`;
      }
      
      if (unmatchedInRef.length > 0) {
        resultMessage += `📝 ${unmatchedInRef.length} detectores en referencia que no están en archivo base\n`;
      }

      resultMessage += `\n📁 Archivo descargado: ${filename}`;

      setMessage(resultMessage);
      logger.info(`Combinación completada: ${matchedCount} coincidencias de ${baseData.length} registros`);
      
    } catch (error) {
      logger.error('Error en combinación de archivos', error);
      setMessage(`❌ Error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    if (baseFileRef.current) baseFileRef.current.value = '';
    if (referenceFileRef.current) referenceFileRef.current.value = '';
    setMessage('');
    setStats(null);
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="bg-white rounded-xl shadow-lg p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            🔗 Combinar Archivos Excel por Detector
          </h1>
          <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-r-lg">
            <p className="text-blue-800 mb-2">
              <strong>Funcionalidad:</strong> Combina dos archivos Excel usando la columna <code className="bg-blue-100 px-2 py-1 rounded">Detector</code> como clave de unión.
            </p>
            <p className="text-blue-700 text-sm">
              El archivo base mantiene todas sus filas y se enriquece con información adicional (Version, Actual, Remediacion, Fuente) 
              del archivo de referencia donde coincida el Detector.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Archivo Base */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-xl border border-blue-200">
              <label className="block text-lg font-semibold text-blue-900 mb-3">
                📊 Archivo Base (Principal)
              </label>
              <input
                ref={baseFileRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="w-full p-4 border-2 border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                onChange={() => setMessage('')}
              />
              <div className="mt-3 text-sm text-blue-700">
                <p className="font-medium">Características:</p>
                <ul className="list-disc list-inside space-y-1 mt-1">
                  <li>Debe contener la columna <strong>Detector</strong></li>
                  <li>Todas las filas se mantienen en el resultado</li>
                  <li>Contiene las columnas principales del sistema</li>
                </ul>
              </div>
            </div>

            {/* Archivo de Referencia */}
            <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-xl border border-green-200">
              <label className="block text-lg font-semibold text-green-900 mb-3">
                📋 Archivo de Referencia
              </label>
              <input
                ref={referenceFileRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="w-full p-4 border-2 border-green-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white"
                onChange={() => setMessage('')}
              />
              <div className="mt-3 text-sm text-green-700">
                <p className="font-medium">Debe contener columnas:</p>
                <ul className="list-disc list-inside space-y-1 mt-1">
                  <li><strong>Detector</strong> (clave de unión)</li>
                  <li><strong>Version, Actual, Remediacion, Fuente</strong></li>
                  <li>Se agrega al archivo base donde coincida</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Botones de Acción */}
          <div className="flex space-x-4">
            <button
              onClick={handleCombineFiles}
              disabled={loading}
              className={`
                flex-1 py-4 px-8 rounded-xl font-semibold text-lg transition-all duration-300 text-white
                ${loading 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-purple-500 to-blue-600 hover:from-purple-600 hover:to-blue-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1'}
              `}
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Combinando archivos...
                </span>
              ) : (
                '🚀 Combinar y Descargar Excel'
              )}
            </button>

            <button
              onClick={resetForm}
              disabled={loading}
              className="px-8 py-4 border-2 border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors font-semibold text-lg"
            >
              🔄 Limpiar
            </button>
          </div>
        </div>

        {/* Mensaje de Estado */}
        {message && (
          <div className={`mt-8 p-6 rounded-xl border-l-4 ${
            message.includes('✅') 
              ? 'bg-green-50 border-green-400 text-green-800' 
              : 'bg-red-50 border-red-400 text-red-800'
          }`}>
            <pre className="whitespace-pre-wrap font-medium">{message}</pre>
          </div>
        )}

        {/* Estadísticas Detalladas */}
        {stats && (
          <div className="mt-8 bg-gray-50 rounded-xl p-6 border border-gray-200">
            <h3 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              📊 Resultados de la Combinación
              <span className="ml-3 text-sm font-normal bg-green-100 text-green-800 px-3 py-1 rounded-full">
                {Math.round((stats.matchedRows / stats.file1Rows) * 100)}% éxito
              </span>
            </h3>
            
            {/* Resumen de Archivos */}
            <div className="grid md:grid-cols-2 gap-6 mb-8">
              <div className="bg-white p-6 rounded-lg border-l-4 border-l-blue-500 shadow-sm">
                <h4 className="font-bold text-lg text-gray-900">{stats.file1Name}</h4>
                <div className="text-blue-600 font-medium">Archivo Base: {stats.file1Rows.toLocaleString()} filas</div>
                <div className="text-sm text-gray-600 mt-1">Se mantuvieron todas las filas</div>
              </div>
              <div className="bg-white p-6 rounded-lg border-l-4 border-l-green-500 shadow-sm">
                <h4 className="font-bold text-lg text-gray-900">{stats.file2Name}</h4>
                <div className="text-green-600 font-medium">Archivo Referencia: {stats.file2Rows.toLocaleString()} filas</div>
                <div className="text-sm text-gray-600 mt-1">Información adicional agregada</div>
              </div>
            </div>

            {/* Métricas del Proceso */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
              <div className="bg-white p-4 rounded-lg shadow-sm text-center">
                <div className="text-3xl font-bold text-green-600">{stats.matchedRows.toLocaleString()}</div>
                <div className="text-sm text-gray-600 font-medium">Coincidencias</div>
              </div>
              <div className="bg-white p-4 rounded-lg shadow-sm text-center">
                <div className="text-3xl font-bold text-yellow-600">{stats.unmatchedRows.toLocaleString()}</div>
                <div className="text-sm text-gray-600 font-medium">Sin coincidencia</div>
              </div>
              <div className="bg-white p-4 rounded-lg shadow-sm text-center">
                <div className="text-3xl font-bold text-blue-600">{stats.totalOutputRows.toLocaleString()}</div>
                <div className="text-sm text-gray-600 font-medium">Filas finales</div>
              </div>
              <div className="bg-white p-4 rounded-lg shadow-sm text-center">
                <div className="text-3xl font-bold text-purple-600">{stats.duplicatesInFile2}</div>
                <div className="text-sm text-gray-600 font-medium">Duplicados Ref.</div>
              </div>
              <div className="bg-white p-4 rounded-lg shadow-sm text-center">
                <div className="text-3xl font-bold text-indigo-600">{(stats.processingTime / 1000).toFixed(1)}s</div>
                <div className="text-sm text-gray-600 font-medium">Tiempo</div>
              </div>
            </div>

            {/* Información de la Columna JOIN */}
            <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <div className="text-lg font-semibold text-purple-900 mb-2">
                🔗 Columna de Unión: <code className="bg-purple-100 px-3 py-1 rounded font-mono">{stats.joinColumn}</code>
              </div>
              <div className="text-sm text-purple-700">
                Se detectó automáticamente la columna 'Detector' para realizar la combinación
              </div>
            </div>

            {/* Análisis de Columnas */}
            <div className="grid lg:grid-cols-3 gap-4 mb-6">
              <div className="bg-white p-4 rounded-lg shadow-sm">
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
                  🔗 Columnas Comunes 
                  <span className="ml-2 bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded">{stats.commonColumns.length}</span>
                </h4>
                <div className="text-sm text-gray-600 max-h-32 overflow-y-auto">
                  {stats.commonColumns.length > 0 ? (
                    <div className="space-y-1">
                      {stats.commonColumns.map((col, idx) => (
                        <div key={idx} className={`${col === stats.joinColumn ? 'font-bold text-purple-700 bg-purple-50 px-2 py-1 rounded' : ''}`}>
                          {col === stats.joinColumn && '→ '}{col}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-gray-400">Ninguna</div>
                  )}
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg shadow-sm">
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
                  📊 Solo en Base 
                  <span className="ml-2 bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded">{stats.file1OnlyColumns.length}</span>
                </h4>
                <div className="text-sm text-gray-600 max-h-32 overflow-y-auto">
                  {stats.file1OnlyColumns.length > 0 ? (
                    <div className="space-y-1">
                      {stats.file1OnlyColumns.map((col, idx) => (
                        <div key={idx}>{col}</div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-gray-400">Ninguna</div>
                  )}
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg shadow-sm">
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
                  📋 Solo en Referencia 
                  <span className="ml-2 bg-green-100 text-green-700 text-xs px-2 py-1 rounded">{stats.file2OnlyColumns.length}</span>
                </h4>
                <div className="text-sm text-gray-600 max-h-32 overflow-y-auto">
                  {stats.file2OnlyColumns.length > 0 ? (
                    <div className="space-y-1">
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

            {/* Advertencias y Observaciones */}
            <div className="space-y-4">
              {stats.unmatchedRows > 0 && (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <h4 className="font-semibold text-yellow-900 mb-2 flex items-center">
                    ⚠️ Registros sin coincidencia
                  </h4>
                  <p className="text-sm text-yellow-800">
                    <strong>{stats.unmatchedRows.toLocaleString()}</strong> registros del archivo base no encontraron 
                    coincidencias en el archivo de referencia. Estos registros se mantuvieron con sus datos originales 
                    (sin las columnas Version, Actual, Remediacion, Fuente).
                  </p>
                </div>
              )}

              {stats.duplicatesInFile2 > 0 && (
                <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                  <h4 className="font-semibold text-orange-900 mb-2 flex items-center">
                    🔄 Detectores duplicados en referencia
                  </h4>
                  <p className="text-sm text-orange-800">
                    Se encontraron <strong>{stats.duplicatesInFile2}</strong> detectores duplicados en el archivo de referencia. 
                    Se utilizó la primera ocurrencia de cada detector para la combinación.
                  </p>
                </div>
              )}

              {stats.unmatchedInFile2 > 0 && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="font-semibold text-blue-900 mb-2 flex items-center">
                    📝 Detectores no utilizados
                  </h4>
                  <p className="text-sm text-blue-800">
                    <strong>{stats.unmatchedInFile2.toLocaleString()}</strong> detectores del archivo de referencia 
                    no se encontraron en el archivo base y por tanto no se utilizaron en la combinación.
                  </p>
                </div>
              )}

              {stats.matchedRows === stats.file1Rows && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <h4 className="font-semibold text-green-900 mb-2 flex items-center">
                    ✅ Combinación perfecta
                  </h4>
                  <p className="text-sm text-green-800">
                    ¡Excelente! Todos los registros del archivo base encontraron información adicional 
                    en el archivo de referencia. La combinación fue 100% exitosa.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Guía de Uso */}
        <div className="mt-8 bg-gradient-to-br from-purple-50 to-blue-50 border border-purple-200 rounded-xl p-6">
          <h3 className="text-xl font-bold text-purple-900 mb-4 flex items-center">
            💡 Guía de Uso - Combinación por Detector
          </h3>
          
          <div className="grid lg:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold text-purple-800 mb-3">🔍 Proceso de Combinación:</h4>
              <ol className="list-decimal list-inside space-y-2 text-sm text-purple-700">
                <li>Se busca automáticamente la columna <code className="bg-purple-100 px-2 py-1 rounded">Detector</code> en ambos archivos</li>
                <li>Por cada registro del archivo base, se busca el mismo detector en el archivo de referencia</li>
                <li>Si hay coincidencia: se agregan las columnas <strong>Version, Actual, Remediacion, Fuente</strong></li>
                <li>Si no hay coincidencia: el registro se mantiene sin información adicional</li>
                <li>Se preservan TODOS los registros del archivo base (LEFT JOIN)</li>
              </ol>
            </div>
            
            <div>
              <h4 className="font-semibold text-purple-800 mb-3">📋 Requisitos de los Archivos:</h4>
              <div className="space-y-3 text-sm text-purple-700">
                <div className="bg-white p-3 rounded-lg border border-purple-100">
                  <strong>Archivo Base:</strong>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>Debe contener columna <code>Detector</code></li>
                    <li>Contiene las columnas principales del sistema</li>
                    <li>Se mantienen todas las filas</li>
                  </ul>
                </div>
                
                <div className="bg-white p-3 rounded-lg border border-purple-100">
                  <strong>Archivo de Referencia:</strong>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>Debe contener columna <code>Detector</code></li>
                    <li>Debe contener: <code>Version, Actual, Remediacion, Fuente</code></li>
                    <li>Si hay duplicados, se usa la primera ocurrencia</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 p-4 bg-white border border-purple-200 rounded-lg">
            <h4 className="font-semibold text-purple-800 mb-2">📤 Resultado Final:</h4>
            <p className="text-sm text-purple-700 mb-3">
              El archivo Excel resultante tendrá las columnas en este orden específico:
            </p>
            <div className="bg-purple-50 p-3 rounded text-xs font-mono text-purple-800">
              Source → Asset Team → Asset Name → Asset Type → URI → Detector → Severity → 
              Description → <strong>Version → Actual → Remediacion → Fuente</strong> → Content Class → 
              Exposure window → Ignored → Line start → Line end
            </div>
            <p className="text-xs text-purple-600 mt-2">
              Las columnas en <strong>negrita</strong> son las que se agregan del archivo de referencia cuando hay coincidencia de Detector.
            </p>
          </div>

          <div className="mt-4 p-4 bg-yellow-50 border border-yellow-300 rounded-lg">
            <h4 className="font-semibold text-yellow-800 mb-2">🎯 Casos de Uso Típicos:</h4>
            <ul className="list-disc list-inside space-y-1 text-sm text-yellow-700">
              <li><strong>Enriquecimiento de vulnerabilidades:</strong> Agregar información de remediación a reportes de seguridad</li>
              <li><strong>Actualización de versiones:</strong> Combinar datos de versiones actuales con información histórica</li>
              <li><strong>Consolidación de fuentes:</strong> Unir información de múltiples herramientas de análisis</li>
              <li><strong>Reportes ejecutivos:</strong> Crear vistas completas combinando datos técnicos y de gestión</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}