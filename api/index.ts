import express from 'express';
import cors from 'cors';
import { initDb } from '../server/src/config/database';
import authRoutes from '../server/src/routes/auth';
import leadRoutes from '../server/src/routes/leads';
import contactRoutes from '../server/src/routes/contacts';
import propertyRoutes from '../server/src/routes/properties';
import csvRoutes from '../server/src/routes/csv';
import integrationRoutes from '../server/src/routes/integrations';
import webhookRoutes from '../server/src/routes/webhooks';
import callRoutes from '../server/src/routes/calls';
import employeeRoutes from '../server/src/routes/employees';

const app = express();

app.use(cors());
app.use(express.json());

initDb();

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

export default app;
