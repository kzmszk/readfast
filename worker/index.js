import catalog from '../.generated/catalog.json';
import { createWorker } from './handler.js';

export default createWorker(catalog);
