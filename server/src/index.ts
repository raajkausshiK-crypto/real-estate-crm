import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDb } from './config/database';
import authRoutes from './routes/auth';
import leadRoutes from './routes/leads';
import contactRoutes from './routes/contacts';
import propertyRoutes from './routes/properties';
import csvRoutes from './routes/csv';
import integrationRoutes from './routes/integrations';
import webhookRoutes from './routes/webhooks';
import callRoutes from './routes/calls';
import employeeRoutes from './routes/employees';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5050;

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/csv', csvRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/employees', employeeRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

initDb();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
