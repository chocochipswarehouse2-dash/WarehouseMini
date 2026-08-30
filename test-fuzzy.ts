import { fuzzySearchMultiple } from './src/utils/sortUtils';
console.log(fuzzySearchMultiple('Taylor', ['Taylor Swift', 'SKU123']));
console.log(fuzzySearchMultiple('Agatha', ['Taylor Swift', 'SKU123']));
