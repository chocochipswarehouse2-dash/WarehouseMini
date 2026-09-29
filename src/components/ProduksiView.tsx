import React from 'react';
import { PenerimaanProduksiView } from './PenerimaanProduksiView';
import { UserSession, ProductItem } from '../types';

interface ProduksiViewProps {
  session: UserSession | null;
  productCatalog?: ProductItem[];
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export const ProduksiView: React.FC<ProduksiViewProps> = ({
  session,
  productCatalog = [],
  onShowToast,
}) => {
  return (
    <PenerimaanProduksiView
      session={session}
      productCatalog={productCatalog}
      onShowToast={onShowToast}
    />
  );
};

export default ProduksiView;
