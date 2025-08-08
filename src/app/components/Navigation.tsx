'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const Navigation = () => {
  const pathname = usePathname();

  const navItems = [
    {
      href: '/',
      label: 'Inicio',
      icon: '🏠'
    },
    {
      href: '/concatenate',
      label: 'Concatenar',
      icon: '📄',
      description: 'Combinar múltiples archivos'
    },
    {
      href: '/unique',
      label: 'Valores Únicos',
      icon: '🔍',
      description: 'Extraer vulnerabilidades únicas'
    },
    {
      href: '/join',
      label: 'Unir Archivos',
      icon: '🔗',
      description: 'Left Join de archivos'
    }
  ];

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(href);
  };

  return (
    <nav className="bg-white shadow-lg">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center py-4">
          <div className="flex items-center space-x-2">
            <span className="text-2xl">📊</span>
            <h1 className="text-xl font-bold text-gray-800">Excel Processor</h1>
          </div>
          
          <div className="flex space-x-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  px-4 py-2 rounded-lg transition-all duration-200 flex items-center space-x-2
                  ${isActive(item.href) 
                    ? 'bg-blue-500 text-white shadow-md' 
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
                  }
                `}
                title={item.description}
              >
                <span>{item.icon}</span>
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;