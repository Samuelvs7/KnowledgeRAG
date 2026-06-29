import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { HomePage } from './pages/HomePage';
import { DocumentsPage } from './pages/DocumentsPage';
import { ProductsPage } from './pages/ProductsPage';
import { CodebasePage } from './pages/CodebasePage';
import { LearningPage } from './pages/LearningPage';
import { ProfilePage } from './pages/ProfilePage';
import { EnginePage } from './pages/EnginePage';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/codebase" element={<CodebasePage />} />
          <Route path="/learning" element={<LearningPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/engine" element={<EnginePage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
