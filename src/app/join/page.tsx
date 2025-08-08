'use client';

import { useState, useRef } from 'react';
import { readFile, downloadExcel, findCommonColumns, logger } from '../utils/fileUtils';

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

  const handleJoinFiles = async () => {
    if (!file1Ref.current?.files?.[0] || !file2Ref.current?.files?.[0]) {
      setMessage('Por favor selecciona ambos archivos CSV o Excel');
      return;
    }

    setLoading(true);
    setMessage('');
    setStats(null);

    try {
      const file1 = file1Ref.current.files[0]; // Archivo a rellenar
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

      const joinColumn = commonColumns[0]; // Usar la primera columna común (ya está priorizada)
      logger.info(`Usando columna para JOIN: ${joinColumn}`);
      
      // Crear índice del segundo archivo para búsqueda rápida
      const data2Index = new Map<string, any>();
      data2.forEach((row, index) => {
        const key = String(row[joinColumn]);
        if (key && key !== 'undefined' && key !== 'null' && key.trim() !== '') {
          // Si hay múltiples filas con la misma clave, mantener la primera
          if (!data2Index.has(key)) {
            data2Index.set(key, { ...row, _source_row: index + 1 });
          }
        }
      });

      logger.info(`Índice creado: ${data2Index.size} claves únicas en archivo 2`);

      // Realizar LEFT JOIN
      let matchedCount = 0;
      const joinedData = data1.map((row1, index) => {
        const key = String(row1[joinColumn]);
        const row2 = data2Index.get(key);
        
        if (row2) {
          // Combinar datos, dando preferencia a row1 en caso de columnas duplicadas
          const combined = { ...row2, ...row1 };
          combined._join_status = 'matched';
          combined._join_key = key;
          combined._file1_row = index + 1;
          combined._file2_row = row2._source_row;
          matchedCount++;
          return combined;
        } else {
          // Si no hay match, mantener solo los datos del archivo 1
          const result = { ...row1 };
          result._join_status = 'no_match';
          result._join_key = key;
          result._file1_row = index + 1;
          result._file2_row = null;
          return result;
        }
      });

      const unmatchedCount = data1.length - matchedCount;

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `archivos_unidos_${timestamp}.xlsx`;
      
      await downloadExcel(joinedData, filename, 'Datos_Unidos');
      
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

      setMessage(`✅ Se unieron los archivos usando la columna "${joinColumn}". ${joinedData.length} filas procesadas (${matchedCount} coincidencias encontradas)`);
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
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Unir Archivos (Left Join)</h1>
          <p className="text-gray-600">
            Realiza un LEFT JOIN entre dos archivos basándose en columnas comunes. El primer archivo 
            se mantiene completo y se enriquece con datos del segundo archivo cuando hay coincidencias.
          </p>
        </div>

        <div className="space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                📄 Archivo principal (a rellenar):
              </label>
              <input
                ref={file1Ref}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                onChange={() => setMessage('')}
              />
              <p className="text-xs text-gray-500 mt-1">
                Este archivo se mantendrá completo (todas las filas)
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
                De este archivo se tomarán datos para enriquecer el principal
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
            {message}
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
          <h3 className="text-lg font-semibold text-purple-900 mb-3">💡 Información de Uso</h3>
          <div className="text-sm text-purple-800 space-y-2">
            <p><strong>Prioridad de columnas para JOIN:</strong></p>
            <ol className="list-decimal list-inside space-y-1 ml-4">
              <li><code>Fingerprint</code> - Identificador único más confiable</li>
              <li><code>Asset</code> - Identificador de activo</li>
              <li><code>Source</code> - Origen de la vulnerabilidad</li>
              <li>Otras columnas comunes por orden alfabético</li>
            </ol>
            <p className="mt-3"><strong>Columnas agregadas al resultado:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li><code>_join_status</code>: 'matched' o 'no_match'</li>
              <li><code>_join_key</code>: Valor usado para el JOIN</li>
              <li><code>_file1_row</code>: Número de fila en archivo principal</li>
              <li><code>_file2_row</code>: Número de fila en archivo de datos (si hay match)</li>
            </ul>
            <p className="mt-3"><strong>Comportamiento:</strong> LEFT JOIN - todas las filas del archivo principal se mantienen</p>
          </div>
        </div>
      </div>
    </div>
  );
}