import Link from 'next/link';

export default function HomePage() {
  const features = [
    {
      href: '/concatenate',
      title: 'Concatenar Archivos',
      icon: '📄',
      description: 'Combina múltiples archivos CSV/Excel de vulnerabilidades en un solo archivo Excel.',
      features: [
        'Soporte para archivos CSV y Excel',
        'Mantiene trazabilidad del archivo origen',
        'Manejo de errores por archivo individual',
        'Validación de columnas esperadas'
      ]
    },
    {
      href: '/unique',
      title: 'Valores Únicos',
      icon: '🔍',
      description: 'Extrae vulnerabilidades únicas eliminando duplicados basándose en identificadores.',
      features: [
        'Detecta automáticamente columnas de identificación',
        'Prioriza Fingerprint, CVE, Detector',
        'Mantiene información de severidad',
        'Reporte de estadísticas detallado'
      ]
    },
    {
      href: '/join',
      title: 'Unir Archivos',
      icon: '🔗',
      description: 'Realiza LEFT JOIN entre archivos basándose en columnas comunes.',
      features: [
        'Detección automática de columnas comunes',
        'Prioriza columnas de identificación únicas',
        'Reporta coincidencias encontradas',
        'Marca estado de join en resultados'
      ]
    }
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Procesador de Archivos Excel
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Herramienta profesional para procesar archivos de vulnerabilidades en formato CSV y Excel. 
          Optimizada para reportes de seguridad y análisis de datos.
        </p>
      </div>

      <div className="grid md:grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
        {features.map((feature, index) => (
          <div key={index} className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow">
            <div className="text-center mb-4">
              <div className="text-4xl mb-2">{feature.icon}</div>
              <h3 className="text-xl font-bold text-gray-900">{feature.title}</h3>
            </div>
            
            <p className="text-gray-600 mb-4 text-center">{feature.description}</p>
            
            <ul className="space-y-2 mb-6">
              {feature.features.map((item, idx) => (
                <li key={idx} className="flex items-start text-sm text-gray-700">
                  <span className="text-green-500 mr-2">✓</span>
                  {item}
                </li>
              ))}
            </ul>
            
            <Link
              href={feature.href}
              className="block w-full bg-blue-500 hover:bg-blue-600 text-white text-center py-2 px-4 rounded-lg transition-colors font-medium"
            >
              Comenzar
            </Link>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow-lg p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Información Técnica</h2>
        
        <div className="grid md:grid-cols-2 gap-8">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-3">Formatos Soportados</h3>
            <ul className="space-y-2 text-gray-700">
              <li className="flex items-center">
                <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
                CSV (separado por comas)
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
                Excel (.xlsx, .xls)
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-purple-500 rounded-full mr-3"></span>
                Archivos mixtos (CSV + Excel)
              </li>
            </ul>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-3">Columnas Reconocidas</h3>
            <div className="text-sm text-gray-700 space-y-1">
              <p><strong>Principales:</strong> Source, Asset, Severity, Description</p>
              <p><strong>Identificación:</strong> Fingerprint, CVE, Detector</p>
              <p><strong>Metadatos:</strong> Team, Asset Name, URI, Content Class</p>
              <p><strong>Gestión:</strong> Ignored, Ignore timestamp, Snooze end</p>
            </div>
          </div>
        </div>
        
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-semibold text-gray-800 mb-2">💡 Consejos de Uso</h4>
          <ul className="text-sm text-gray-700 space-y-1">
            <li>• Los archivos CSV deben usar comas como separador</li>
            <li>• Los campos con comas deben estar entre comillas</li>
            <li>• Se recomienda tener headers en la primera fila</li>
            <li>• Todos los archivos de salida se generan en formato Excel</li>
          </ul>
        </div>
      </div>
    </div>
  );
}