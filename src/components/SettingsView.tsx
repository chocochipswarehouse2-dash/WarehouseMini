import React from 'react';
import { SettingsModal, SettingsModalProps } from './SettingsModal';

export interface SettingsViewProps extends Omit<SettingsModalProps, 'isOpen'> {
  isOpen?: boolean;
}

export const SettingsView: React.FC<SettingsViewProps> = (props) => {
  return <SettingsModal {...props} isOpen={true} mode="page" />;
};

export default SettingsView;
