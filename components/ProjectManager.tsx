import React, { useState } from 'react';
import { X, FolderOpen, Trash2, Edit2, Plus, FileText } from 'lucide-react';
import { DashboardProject } from '../types';

interface ProjectManagerProps {
  isOpen: boolean;
  onClose: () => void;
  projects: DashboardProject[];
  currentProjectId: string | null;
  onLoadProject: (id: string) => void;
  onCreateProject: (name: string) => void;
  onDeleteProject: (id: string) => void;
  onRenameProject: (id: string, newName: string) => void;
}

const ProjectManager: React.FC<ProjectManagerProps> = ({
  isOpen,
  onClose,
  projects,
  currentProjectId,
  onLoadProject,
  onCreateProject,
  onDeleteProject,
  onRenameProject
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  if (!isOpen) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (newProjectName.trim()) {
      onCreateProject(newProjectName.trim());
      setNewProjectName('');
      setIsCreating(false);
    }
  };

  const handleRename = (id: string) => {
    if (editName.trim()) {
      onRenameProject(id, editName.trim());
      setEditingId(null);
      setEditName('');
    }
  };

  const formatDate = (ts: number) => {
    return new Intl.DateTimeFormat('pt-BR', { 
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' 
    }).format(new Date(ts));
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <FolderOpen className="text-brand-orange" />
              Meus Dashboards
            </h2>
            <p className="text-xs text-gray-500 mt-1">Gerencie seus layouts salvos</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-full">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
          
          {/* Create New Section */}
          {!isCreating ? (
            <button 
              onClick={() => setIsCreating(true)}
              className="w-full py-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 font-medium hover:border-brand-orange hover:text-brand-orange hover:bg-brand-orange/5 transition-all flex items-center justify-center gap-2 mb-6 group"
            >
              <Plus className="group-hover:scale-110 transition-transform" />
              Criar Novo Dashboard
            </button>
          ) : (
            <form onSubmit={handleCreate} className="mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-200 animate-in fade-in slide-in-from-top-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Nome do Projeto</label>
              <div className="flex gap-2">
                <input 
                  autoFocus
                  type="text" 
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="ex: Relatório Q1"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange outline-none"
                />
                <button type="submit" className="px-4 py-2 bg-brand-orange text-white rounded-lg font-medium hover:bg-orange-600">Criar</button>
                <button type="button" onClick={() => setIsCreating(false)} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-lg">Cancelar</button>
              </div>
            </form>
          )}

          {/* List */}
          <div className="space-y-3">
            {projects.length === 0 && !isCreating && (
                <div className="text-center py-12 text-gray-400">
                    <FileText size={48} className="mx-auto mb-3 opacity-20" />
                    <p>Nenhum dashboard encontrado.</p>
                </div>
            )}

            {projects.sort((a,b) => b.updatedAt - a.updatedAt).map(project => (
              <div 
                key={project.id}
                className={`group bg-white p-4 rounded-xl border transition-all hover:shadow-md flex items-center justify-between ${project.id === currentProjectId ? 'border-brand-orange ring-1 ring-brand-orange shadow-sm' : 'border-gray-200'}`}
              >
                <div className="flex-1 min-w-0 mr-4">
                  {editingId === project.id ? (
                    <div className="flex items-center gap-2">
                        <input 
                            autoFocus
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded"
                            onKeyDown={(e) => e.key === 'Enter' && handleRename(project.id)}
                        />
                        <button onClick={() => handleRename(project.id)} className="text-xs bg-brand-orange text-white px-2 py-1 rounded">Salvar</button>
                    </div>
                  ) : (
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="font-bold text-gray-900 truncate">{project.name}</h3>
                            {project.id === currentProjectId && <span className="text-[10px] bg-brand-orange/10 text-brand-orange px-2 py-0.5 rounded-full font-medium">Ativo</span>}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">Editado em {formatDate(project.updatedAt)} • {project.data.blocks.length} blocos</p>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1">
                    {project.id !== currentProjectId && (
                        <button 
                            onClick={() => {
                                onLoadProject(project.id);
                                onClose();
                            }}
                            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                        >
                            Abrir
                        </button>
                    )}
                    
                    <div className="h-6 w-px bg-gray-200 mx-1" />

                    <button 
                        onClick={() => {
                            setEditingId(project.id);
                            setEditName(project.name);
                        }}
                        className="p-2 text-gray-400 hover:text-brand-black hover:bg-gray-100 rounded-lg transition-colors"
                        title="Renomear"
                    >
                        <Edit2 size={16} />
                    </button>
                    <button 
                        onClick={() => {
                            if(confirm('Tem certeza que deseja excluir este dashboard?')) onDeleteProject(project.id);
                        }}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Excluir"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 bg-white text-center text-xs text-gray-400">
            As alterações são salvas automaticamente no seu navegador.
        </div>
      </div>
    </div>
  );
};

export default ProjectManager;