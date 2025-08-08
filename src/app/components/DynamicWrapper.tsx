'use client';

import { useEffect, useState } from 'react';

interface DynamicWrapperProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

const DynamicWrapper: React.FC<DynamicWrapperProps> = ({ 
  children, 
  fallback = <div className="flex justify-center items-center h-64">Cargando...</div> 
}) => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};

export default DynamicWrapper;