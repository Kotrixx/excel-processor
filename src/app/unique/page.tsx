'use client';

import { useState, useRef } from 'react';

// Importar tipos pero no funciones directamente
import type { VulnerabilityData } from '../utils/fileUtils';

export default function UniquePage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [stats, setStats] = useState<{
    totalRows: number;
    uniqueRows: number;
    duplicatesRemoved: number;
    columnUsed: string;
    severityBreakdown: { [key: string]: number };
    topSources: { [key: string]: number };
    topDetectors: { [key: string]: number };
    topAssets: { [key: string]: number };
  } | null>(null);
  
  const fileRef = useRef<HTMLInputElement>(null);

  // Logger inline para evitar problemas de import
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

  // Funciones de utilidad inline para evitar problemas de import
  const readFile = async (file: File): Promise<Record<string, unknown>[]> => {
    const fileExtension = file.name.toLowerCase().split('.').pop();
    logger.info(`Detectado tipo de archivo: ${fileExtension} para ${file.name}`);
    
    if (fileExtension === 'csv') {
      return await readCSVFile(file);
    } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
      const ExcelJS = await import('exceljs');
      const excelData = await readExcelFile(file, ExcelJS);
      const firstSheetName = Object.keys(excelData)[0];
      logger.debug(`Usando primera hoja del Excel: ${firstSheetName}`);
      return excelData[firstSheetName];
    } else {
      const error = `Tipo de archivo no soportado: ${fileExtension}`;
      logger.error(error);
      throw new Error(error);
    }
  };

  const readCSVFile = (file: File): Promise<Record<string, unknown>[]> => {
    return new Promise((resolve, reject) => {
      logger.info(`Iniciando lectura de archivo CSV: ${file.name}`);
      
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

  const readExcelFile = async (file: File, ExcelJS: typeof import('exceljs')): Promise<{ [key: string]: Record<string, unknown>[] }> => {
    return new Promise((resolve, reject) => {
      logger.info(`Iniciando lectura de archivo Excel: ${file.name}`);
      
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

  const downloadExcel = async (
    data: Record<string, unknown>[], 
    filename: string, 
    sheetName: string = 'Sheet1'
  ): Promise<void> => {
    logger.info(`Iniciando descarga de Excel: ${filename} con ${data.length} filas`);
    
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
      
      logger.info(`Descarga completada: ${filename}`);
    } catch (error) {
      logger.error(`Error en descarga de Excel: ${filename}`, error);
      throw error;
    }
  };

  const findUniqueColumns = (data: Record<string, unknown>[]): string[] => {
    if (data.length === 0) return [];
    
    const sampleRow = data[0];
    // Priorizar Detector como primera opción para vulnerabilidades
    const priorityColumns = [
      'Detector', 'detector', 
      'Fingerprint', 'fingerprint', 
      'CVE', 'cve', 
      'Asset Name', 'asset name', 'assetname',
      'URI', 'uri'
    ];
    
    const foundColumns = Object.keys(sampleRow).filter(key => 
      key.toLowerCase().includes('detector') ||
      key.toLowerCase().includes('fingerprint') ||
      key.toLowerCase().includes('cve') || 
      key.toLowerCase().includes('codigo') || 
      key.toLowerCase().includes('code') ||
      key.toLowerCase().includes('mgh') ||
      key.toLowerCase().includes('uri') ||
      key.toLowerCase().includes('asset name') ||
      key.toLowerCase().includes('assetname')
    );
    
    // Priorizar Detector como primera opción
    const sorted = foundColumns.sort((a, b) => {
      const aIndex = priorityColumns.findIndex(p => a.toLowerCase().includes(p.toLowerCase()));
      const bIndex = priorityColumns.findIndex(p => b.toLowerCase().includes(p.toLowerCase()));
      
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return 0;
    });
    
    logger.debug('Columnas únicas encontradas (priorizando Detector):', sorted);
    return sorted;
  };

  const handleUniqueValues = async () => {
    if (!fileRef.current?.files?.[0]) {
      setMessage('Por favor selecciona un archivo CSV o Excel');
      return;
    }

    setLoading(true);
    setMessage('');
    setStats(null);

    try {
      const file = fileRef.current.files[0];
      logger.info(`Iniciando extracción de valores únicos: ${file.name}`);
      
      const fileData = await readFile(file);

      if (fileData.length === 0) {
        setMessage('❌ El archivo está vacío o no se pudo leer');
        return;
      }

      logger.info(`Archivo cargado: ${fileData.length} filas`);

      // Encontrar columnas de identificación única
      const uniqueColumns = findUniqueColumns(fileData);

      if (uniqueColumns.length === 0) {
        setMessage('❌ No se encontró una columna de códigos únicos (CVE, MGH, Fingerprint, etc.)');
        return;
      }

      const codeColumn = uniqueColumns[0]; // Usar la primera columna encontrada
      logger.info(`Usando columna para deduplicación: ${codeColumn}`);
      
      const uniqueVulnerabilities = new Map<string, VulnerabilityData>();
      const severityCount: { [key: string]: number } = {};
      const sourceCount: { [key: string]: number } = {};
      const detectorCount: { [key: string]: number } = {};
      const assetCount: { [key: string]: number } = {};
      
      fileData.forEach(row => {
        const code = row[codeColumn];
        if (code && code.toString().trim() && !uniqueVulnerabilities.has(code.toString())) {
          const processedRow = {
            // Campos principales de identificación
            codigo_unico: code,
            detector: row.Detector || row.detector || '',
            fingerprint: row.Fingerprint || row.fingerprint || '',
            
            // Información del activo
            source: row.Source || row.source || '',
            asset: row.Asset || row.asset || '',
            team: row.Team || row.team || '',
            asset_name: row['Asset Name'] || row.asset_name || row.assetname || '',
            asset_type: row['Asset Type'] || row.asset_type || row.assettype || '',
            uri: row.URI || row.uri || '',
            
            // Información de la vulnerabilidad
            severidad: row.Severity || row.severity || row.Criticidad || 'No especificada',
            descripcion: row.Description || row.description || row.Descripcion || '',
            content_class: row['Content Class'] || row.content_class || '',
            
            // Información de gestión
            exposure_window: row['Exposure window'] || row.exposure_window || '',
            ignored: row.Ignored || row.ignored || '',
            line_start: row['Line start'] || row.line_start || '',
            line_end: row['Line end'] || row.line_end || '',
            
            // Metadatos de procesamiento
            _extracted_at: new Date().toISOString(),
            _original_file: file.name,
            _deduplication_column: codeColumn,
            
            // Mantener todos los campos originales también
            ...row
          };

          uniqueVulnerabilities.set(code.toString(), processedRow);

          // Estadísticas de severidad
          const severity = processedRow.severidad.toString();
          severityCount[severity] = (severityCount[severity] || 0) + 1;

          // Estadísticas de source
          const source = processedRow.source.toString();
          if (source) {
            sourceCount[source] = (sourceCount[source] || 0) + 1;
          }

          // Estadísticas de detector
          const detector = processedRow.detector.toString();
          if (detector) {
            detectorCount[detector] = (detectorCount[detector] || 0) + 1;
          }

          // Estadísticas de asset
          const asset = processedRow.asset.toString();
          if (asset) {
            assetCount[asset] = (assetCount[asset] || 0) + 1;
          }
        }
      });

      const uniqueData = Array.from(uniqueVulnerabilities.values());
      
      // Ordenar por severidad (Critical > High > Medium > Low > Unknown)
      const severityOrder = { 'Critical': 0, 'High': 1, 'Medium': 2, 'Low': 3 };
      uniqueData.sort((a, b) => {
        const aSeverity = severityOrder[a.severidad as keyof typeof severityOrder] ?? 999;
        const bSeverity = severityOrder[b.severidad as keyof typeof severityOrder] ?? 999;
        return aSeverity - bSeverity;
      });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `vulnerabilidades_unicas_${timestamp}.xlsx`;
      
      await downloadExcel(uniqueData, filename, 'Vulnerabilidades_Unicas');
      
      // Top 5 sources, detectors y assets
      const topSources = Object.entries(sourceCount)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {});

      const topDetectors = Object.entries(detectorCount)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {});

      const topAssets = Object.entries(assetCount)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {});

      setStats({
        totalRows: fileData.length,
        uniqueRows: uniqueData.length,
        duplicatesRemoved: fileData.length - uniqueData.length,
        columnUsed: codeColumn,
        severityBreakdown: severityCount,
        topSources,
        topDetectors,
        topAssets
      });

      setMessage(`✅ Se encontraron ${uniqueData.length} vulnerabilidades únicas usando la columna "${codeColumn}"`);
      logger.info(`Extracción completada: ${uniqueData.length} vulnerabilidades únicas`);
      
    } catch (error) {
      logger.error('Error en extracción de únicos', error);
      setMessage(`❌ Error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    if (fileRef.current) {
      fileRef.current.value = '';
    }
    setMessage('');
    setStats(null);
  };

  const getSeverityColor = (severity: string) => {
    const colors: { [key: string]: string } = {
      'Critical': 'text-red-600 bg-red-100',
      'High': 'text-orange-600 bg-orange-100',
      'Medium': 'text-yellow-600 bg-yellow-100',
      'Low': 'text-blue-600 bg-blue-100',
      'Info': 'text-gray-600 bg-gray-100'
    };
    return colors[severity] || 'text-gray-600 bg-gray-100';
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Extraer Vulnerabilidades Únicas</h1>
          <p className="text-gray-600">
            Extrae vulnerabilidades únicas eliminando duplicados basándose en identificadores como 
            Fingerprint, CVE, o Detector. Ideal para reportes sin duplicaciones.
          </p>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Seleccionar archivo CSV o Excel:
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              onChange={() => setMessage('')}
            />
            <p className="text-sm text-gray-500 mt-1">
              Se detectarán automáticamente las columnas de identificación única (Fingerprint, CVE, Detector, etc.)
            </p>
          </div>

          <div className="flex space-x-4">
            <button
              onClick={handleUniqueValues}
              disabled={loading}
              className={`
                flex-1 py-3 px-6 rounded-lg font-medium transition-colors text-white
                ${loading 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-green-500 hover:bg-green-600'}
              `}
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Extrayendo únicos...
                </span>
              ) : (
                'Extraer Únicos y Descargar Excel'
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
            {message}
          </div>
        )}

        {/* Estadísticas detalladas */}
        {stats && (
          <div className="mt-6 bg-gray-50 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">📊 Análisis de Deduplicación</h3>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white p-4 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{stats.totalRows}</div>
                <div className="text-sm text-gray-600">Filas Original</div>
              </div>
              <div className="bg-white p-4 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{stats.uniqueRows}</div>
                <div className="text-sm text-gray-600">Únicos</div>
              </div>
              <div className="bg-white p-4 rounded-lg">
                <div className="text-2xl font-bold text-red-600">{stats.duplicatesRemoved}</div>
                <div className="text-sm text-gray-600">Duplicados</div>
              </div>
              <div className="bg-white p-4 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">
                  {Math.round((stats.duplicatesRemoved / stats.totalRows) * 100)}%
                </div>
                <div className="text-sm text-gray-600">Reducción</div>
              </div>
            </div>

            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="text-sm font-medium text-blue-900">
                Columna utilizada para deduplicación: <code className="bg-blue-100 px-2 py-1 rounded">{stats.columnUsed}</code>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {/* Breakdown por severidad */}
              <div className="bg-white p-4 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-3">Distribución por Severidad</h4>
                <div className="space-y-2">
                  {Object.entries(stats.severityBreakdown)
                    .sort(([,a], [,b]) => b - a)
                    .map(([severity, count]) => (
                    <div key={severity} className="flex justify-between items-center">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getSeverityColor(severity)}`}>
                        {severity}
                      </span>
                      <span className="font-medium text-gray-900">{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top detectores */}
              <div className="bg-white p-4 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-3">Top Detectores</h4>
                <div className="space-y-2">
                  {Object.entries(stats.topDetectors).map(([detector, count]) => (
                    <div key={detector} className="flex justify-between items-center">
                      <span className="text-sm text-gray-700 truncate flex-1 mr-2" title={detector}>
                        {detector || 'Sin especificar'}
                      </span>
                      <span className="font-medium text-blue-600">{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top assets */}
              <div className="bg-white p-4 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-3">Top Assets</h4>
                <div className="space-y-2">
                  {Object.entries(stats.topAssets).map(([asset, count]) => (
                    <div key={asset} className="flex justify-between items-center">
                      <span className="text-sm text-gray-700 truncate flex-1 mr-2" title={asset}>
                        {asset || 'Sin especificar'}
                      </span>
                      <span className="font-medium text-purple-600">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Top sources - ahora en fila separada */}
            <div className="mt-4 bg-white p-4 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-3">Top Sources</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {Object.entries(stats.topSources).map(([source, count]) => (
                  <div key={source} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                    <span className="text-sm text-gray-700 truncate flex-1 mr-2" title={source}>
                      {source || 'Sin especificar'}
                    </span>
                    <span className="font-medium text-green-600">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Información de ayuda */}
        <div className="mt-8 bg-green-50 border border-green-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-green-900 mb-3">💡 Información de Uso</h3>
          <div className="text-sm text-green-800 space-y-2">
            <p><strong>Columnas priorizadas para deduplicación (en orden):</strong></p>
            <ol className="list-decimal list-inside space-y-1 ml-4">
              <li><code>Fingerprint</code> - Identificador único más confiable</li>
              <li><code>Detector</code> - Herramienta que detectó la vulnerabilidad (muy importante)</li>
              <li><code>CVE</code> - Identificador de vulnerabilidad estándar</li>
              <li><code>Asset Name</code> - Nombre específico del activo</li>
              <li><code>URI</code> - Ubicación específica de la vulnerabilidad</li>
            </ol>
            <p className="mt-3"><strong>Campos procesados automáticamente:</strong></p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
              <div>
                <p className="font-medium">Identificación:</p>
                <ul className="text-xs space-y-1 ml-2">
                  <li>• Detector, Fingerprint, CVE</li>
                  <li>• Source, Asset, Team</li>
                  <li>• Asset Name, Asset Type, URI</li>
                </ul>
              </div>
              <div>
                <p className="font-medium">Vulnerabilidad:</p>
                <ul className="text-xs space-y-1 ml-2">
                  <li>• Severity, Description</li>
                  <li>• Content Class, Exposure window</li>
                  <li>• Line start, Line end, Ignored</li>
                </ul>
              </div>
            </div>
            <p className="mt-3"><strong>Metadatos agregados:</strong> <code>_extracted_at</code>, <code>_original_file</code>, <code>_deduplication_column</code></p>
            <p><strong>Ordenamiento:</strong> Por severidad (Critical → High → Medium → Low)</p>
          </div>
        </div>
      </div>
    </div>
  );
}