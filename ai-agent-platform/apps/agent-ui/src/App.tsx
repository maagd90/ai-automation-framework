import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import JobStatusPage from './pages/JobStatusPage';
import ResultPage from './pages/ResultPage';
import CaseInspectorPage from './pages/CaseInspectorPage';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/jobs/:jobId" element={<JobStatusPage />} />
        <Route path="/jobs/:jobId/result" element={<ResultPage />} />
        <Route path="/jobs/:jobId/cases/:testCaseId" element={<CaseInspectorPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
