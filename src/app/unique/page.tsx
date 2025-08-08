'use client';

import { useState, useRef } from 'react';
import { readFile, downloadExcel, findUniqueColumns, logger, VulnerabilityData } from '../utils/fileUtils';

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
  } | null>(null);
  
  const fileRef = useRef<HTMLInputElement>(null);

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
      
      fileData.forEach(row => {
        const code = row[codeColumn];
        if (code && code.toString().trim() && !uniqueVulnerabilities.has(code)) {
          const processedRow = {
            codigo_unico: code,
            severidad: row.Severity || row.severity || row.Criticidad || 'No especificada',
            descripcion: row.Description || row.description || row.Descripcion || '',
            detector: row.Detector || row.detector || '',
            asset: row.Asset || row.asset || '',
            source: row.Source || row.source || '',
            team: row.Team || row.team || '',
            uri: row.URI || row.uri || '',
            content_class: row['Content Class'] || row.content_class || '',
            ...row,
            _extracted_at: new Date().toISOString(),
            _original_file: file.name
          };

          uniqueVulnerabilities.set(code, processedRow);

          // Estadísticas de severidad
          const severity = processedRow.severidad;
          severityCount[severity] = (severityCount[severity] || 0) + 1;

          // Estadísticas de source
          const source = processedRow.source;
          if (source) {
            sourceCount[source] = (sourceCount[source] || 0) + 1;
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
      
      // Top 5 sources
      const topSources = Object.entries(sourceCount)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {});

      setStats({
        totalRows: fileData.length,
        uniqueRows: uniqueData.length,
        duplicatesRemoved: fileData.length - uniqueData.length,
        columnUsed: codeColumn,
        severityBreakdown: severityCount,
        topSources
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

            <div className="grid md:grid-cols-2 gap-6">
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

              {/* Top sources */}
              <div className="bg-white p-4 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-3">Top Sources</h4>
                <div className="space-y-2">
                  {Object.entries(stats.topSources).map(([source, count]) => (
                    <div key={source} className="flex justify-between items-center">
                      <span className="text-sm text-gray-700 truncate flex-1 mr-2">{source || 'Sin especificar'}</span>
                      <span className="font-medium text-gray-900">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Información de ayuda */}
        <div className="mt-8 bg-green-50 border border-green-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-green-900 mb-3">💡 Información de Uso</h3>
          <div className="text-sm text-green-800 space-y-2">
            <p><strong>Columnas priorizadas para deduplicación:</strong></p>
            <ol className="list-decimal list-inside space-y-1 ml-4">
              <li><code>Fingerprint</code> - Identificador único más confiable</li>
              <li><code>CVE</code> - Identificador de vulnerabilidad estándar</li>
              <li><code>Detector</code> - Herramienta que detectó la vulnerabilidad</li>
              <li>Cualquier columna que contenga: code, codigo, mgh</li>
            </ol>
            <p className="mt-3"><strong>Columnas agregadas:</strong> <code>_extracted_at</code>, <code>_original_file</code></p>
            <p><strong>Ordenamiento:</strong> Por severidad (Critical → High → Medium → Low)</p>
          </div>
        </div>
      </div>
    </div>
  );
}