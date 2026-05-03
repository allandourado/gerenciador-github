// ===== GitHub File Manager App =====
(function () {
    'use strict';

    // --- State ---
    let token = '';
    let vercelToken = '';
    let currentUser = null;
    let repos = [];
    let currentRepo = null;
    let currentPath = '';
    let currentFiles = [];
    let selectedFiles = new Set();
    let vercelProjects = [];
    let linkedVercelProject = null;

    // --- DOM refs ---
    const $ = (id) => document.getElementById(id);
    const authScreen = $('auth-screen');
    const mainScreen = $('main-screen');
    const tokenInput = $('token-input');
    const saveTokenCheck = $('save-token-check');
    const connectBtn = $('connect-btn');
    const toggleTokenBtn = $('toggle-token-visibility');
    const logoutBtn = $('logout-btn');
    const userAvatar = $('user-avatar');
    const userName = $('user-name');
    const repoSearch = $('repo-search');
    const repoList = $('repo-list');
    const emptyState = $('empty-state');
    const fileExplorer = $('file-explorer');
    const breadcrumb = $('breadcrumb');
    const fileList = $('file-list');
    const selectAllCheck = $('select-all-check');
    const selectedCountEl = $('selected-count');
    const deleteSelectedBtn = $('delete-selected-btn');
    const deleteAllDirBtn = $('delete-all-dir-btn');
    const deleteModal = $('delete-modal');
    const deleteModalMessage = $('delete-modal-message');
    const deleteFileList = $('delete-file-list');
    const commitMessageInput = $('commit-message');
    const cancelDeleteBtn = $('cancel-delete-btn');
    const confirmDeleteBtn = $('confirm-delete-btn');
    const progressModal = $('progress-modal');
    const progressMessage = $('progress-message');
    const progressFill = $('progress-fill');
    const progressText = $('progress-text');
    const progressLog = $('progress-log');
    const progressTitle = $('progress-title');
    const uploadBtn = $('upload-btn');
    const uploadInput = $('upload-input');
    const vercelTokenInput = $('vercel-token-input');
    const toggleVercelBtn = $('toggle-vercel-visibility');
    const vercelDeployBtn = $('vercel-deploy-btn');
    const vercelDeployText = $('vercel-deploy-text');
    const vercelStatus = $('vercel-status');

    // --- API Helper ---
    async function ghFetch(endpoint, options = {}) {
        const url = endpoint.startsWith('http') ? endpoint : `https://api.github.com${endpoint}`;
        const res = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                ...(options.headers || {}),
            },
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || `GitHub API error: ${res.status}`);
        }
        if (res.status === 204) return null;
        return res.json();
    }

    // --- Toast ---
    function showToast(message, type = 'info') {
        const container = $('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icons = {
            success: '✓',
            error: '✕',
            info: 'ℹ',
        };
        toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(50px)';
            toast.style.transition = '0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    // --- Format bytes ---
    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    // --- Auth ---
    function initAuth() {
        const saved = localStorage.getItem('ghfm_token');
        if (saved) {
            tokenInput.value = saved;
            saveTokenCheck.checked = true;
        }
        const savedVercel = localStorage.getItem('ghfm_vercel_token');
        if (savedVercel) {
            vercelTokenInput.value = savedVercel;
        }
    }

    async function connect() {
        const t = tokenInput.value.trim();
        if (!t) { showToast('Insira um token do GitHub', 'error'); return; }
        connectBtn.disabled = true;
        connectBtn.innerHTML = '<div class="spinner" style="width:20px;height:20px;border-width:2px;"></div> Conectando...';
        try {
            token = t;
            currentUser = await ghFetch('/user');

            // Handle Vercel token
            vercelToken = vercelTokenInput.value.trim();

            if (saveTokenCheck.checked) {
                localStorage.setItem('ghfm_token', t);
                if (vercelToken) localStorage.setItem('ghfm_vercel_token', vercelToken);
                else localStorage.removeItem('ghfm_vercel_token');
            } else {
                localStorage.removeItem('ghfm_token');
                localStorage.removeItem('ghfm_vercel_token');
            }

            // Load Vercel projects if token provided
            if (vercelToken) {
                try {
                    await loadVercelProjects();
                } catch (e) {
                    showToast('Vercel: ' + e.message, 'error');
                }
            }

            showMainScreen();
            showToast(`Bem-vindo, ${currentUser.login}!`, 'success');
        } catch (e) {
            showToast('Falha na autenticação: ' + e.message, 'error');
            token = '';
        } finally {
            connectBtn.disabled = false;
            connectBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg> Conectar ao GitHub`;
        }
    }

    function logout() {
        token = '';
        vercelToken = '';
        currentUser = null;
        repos = [];
        currentRepo = null;
        currentPath = '';
        currentFiles = [];
        selectedFiles.clear();
        vercelProjects = [];
        linkedVercelProject = null;

        mainScreen.classList.remove('active');
        authScreen.classList.add('active');
        
        vercelDeployBtn.style.display = 'none';
        vercelStatus.style.display = 'none';
    }

    // --- Show Main Screen ---
    async function showMainScreen() {
        authScreen.classList.remove('active');
        mainScreen.classList.add('active');
        userAvatar.src = currentUser.avatar_url;
        userName.textContent = currentUser.login;
        await loadRepos();
    }

    // --- Repos ---
    async function loadRepos() {
        repoList.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><span>Carregando repositórios...</span></div>';
        try {
            let page = 1;
            let allRepos = [];
            while (true) {
                const batch = await ghFetch(`/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner`);
                allRepos = allRepos.concat(batch);
                if (batch.length < 100) break;
                page++;
            }
            repos = allRepos;
            renderRepos(repos);
        } catch (e) {
            repoList.innerHTML = `<div class="loading-spinner"><span style="color:var(--danger)">Erro: ${e.message}</span></div>`;
        }
    }

    function renderRepos(list) {
        if (list.length === 0) {
            repoList.innerHTML = '<div class="loading-spinner"><span>Nenhum repositório encontrado</span></div>';
            return;
        }
        repoList.innerHTML = list.map(r => `
            <div class="repo-item" data-repo="${r.full_name}" title="${r.full_name}">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                <div class="repo-info">
                    <div class="repo-name">${r.name}</div>
                    <div class="repo-meta">
                        <span>${r.default_branch || 'main'}</span>
                        ${r.language ? `<span>• ${r.language}</span>` : ''}
                    </div>
                </div>
                ${r.private ? '<span class="repo-private">PRIVADO</span>' : ''}
            </div>
        `).join('');

        repoList.querySelectorAll('.repo-item').forEach(item => {
            item.addEventListener('click', () => selectRepo(item.dataset.repo));
        });
    }

    function filterRepos() {
        const q = repoSearch.value.toLowerCase().trim();
        const filtered = q ? repos.filter(r => r.name.toLowerCase().includes(q) || r.full_name.toLowerCase().includes(q)) : repos;
        renderRepos(filtered);
        if (currentRepo) {
            const active = repoList.querySelector(`[data-repo="${currentRepo.full_name}"]`);
            if (active) active.classList.add('active');
        }
    }

    async function selectRepo(fullName) {
        repoList.querySelectorAll('.repo-item').forEach(i => i.classList.remove('active'));
        const el = repoList.querySelector(`[data-repo="${fullName}"]`);
        if (el) el.classList.add('active');

        currentRepo = repos.find(r => r.full_name === fullName);
        currentPath = '';
        selectedFiles.clear();
        emptyState.style.display = 'none';
        fileExplorer.style.display = 'flex';

        // Check Vercel link
        linkedVercelProject = findLinkedVercelProject(fullName);
        updateVercelUI();

        await loadDirectory('');
    }

    // --- Directory Navigation ---
    async function loadDirectory(path) {
        currentPath = path;
        selectedFiles.clear();
        updateSelectionUI();
        fileList.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><span>Carregando arquivos...</span></div>';
        renderBreadcrumb();
        try {
            const endpoint = `/repos/${currentRepo.full_name}/contents/${path}`;
            const data = await ghFetch(endpoint);
            if (!Array.isArray(data)) {
                currentFiles = [];
                fileList.innerHTML = '<div class="loading-spinner"><span>Este caminho não é um diretório</span></div>';
                return;
            }
            // Sort: dirs first, then files alphabetically
            data.sort((a, b) => {
                if (a.type === 'dir' && b.type !== 'dir') return -1;
                if (a.type !== 'dir' && b.type === 'dir') return 1;
                return a.name.localeCompare(b.name);
            });
            currentFiles = data;
            renderFiles(data);
        } catch (e) {
            fileList.innerHTML = `<div class="loading-spinner"><span style="color:var(--danger)">Erro: ${e.message}</span></div>`;
            currentFiles = [];
        }
    }

    function renderBreadcrumb() {
        const parts = currentPath ? currentPath.split('/') : [];
        let html = `<span class="breadcrumb-item ${parts.length === 0 ? 'active' : ''}" data-path="">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            ${currentRepo ? currentRepo.name : 'Raiz'}
        </span>`;
        parts.forEach((part, i) => {
            const pathUpTo = parts.slice(0, i + 1).join('/');
            const isLast = i === parts.length - 1;
            html += `<span class="breadcrumb-sep">›</span>`;
            html += `<span class="breadcrumb-item ${isLast ? 'active' : ''}" data-path="${pathUpTo}">${part}</span>`;
        });
        breadcrumb.innerHTML = html;
        breadcrumb.querySelectorAll('.breadcrumb-item:not(.active)').forEach(item => {
            item.addEventListener('click', () => loadDirectory(item.dataset.path));
        });
    }

    function renderFiles(files) {
        if (files.length === 0) {
            fileList.innerHTML = '<div class="loading-spinner"><span>Diretório vazio</span></div>';
            return;
        }
        fileList.innerHTML = files.map(f => {
            const isDir = f.type === 'dir';
            return `
                <div class="file-item ${isDir ? 'is-dir' : ''}" data-path="${f.path}" data-sha="${f.sha}" data-type="${f.type}" data-name="${f.name}">
                    ${!isDir ? `
                        <label class="checkbox-wrapper file-checkbox" onclick="event.stopPropagation()">
                            <input type="checkbox" class="file-check" data-path="${f.path}" data-sha="${f.sha}" data-name="${f.name}">
                            <span class="checkbox-custom"></span>
                        </label>
                    ` : '<div style="width:30px;"></div>'}
                    <div class="file-icon ${isDir ? 'folder' : 'file'}">
                        ${isDir ? `
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                            </svg>
                        ` : `
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                            </svg>
                        `}
                    </div>
                    <div class="file-info">
                        <div class="file-name">${f.name}</div>
                        <div class="file-size">${isDir ? 'Pasta' : formatBytes(f.size || 0)}</div>
                    </div>
                </div>
            `;
        }).join('');

        // Click handlers
        fileList.querySelectorAll('.file-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.file-checkbox')) return;
                const type = item.dataset.type;
                if (type === 'dir') {
                    loadDirectory(item.dataset.path);
                } else {
                    // Toggle checkbox
                    const cb = item.querySelector('.file-check');
                    if (cb) {
                        cb.checked = !cb.checked;
                        handleFileCheck(cb);
                    }
                }
            });
        });

        // Checkbox handlers
        fileList.querySelectorAll('.file-check').forEach(cb => {
            cb.addEventListener('change', () => handleFileCheck(cb));
        });
    }

    function handleFileCheck(cb) {
        const path = cb.dataset.path;
        if (cb.checked) {
            selectedFiles.add(path);
            cb.closest('.file-item').classList.add('selected');
        } else {
            selectedFiles.delete(path);
            cb.closest('.file-item').classList.remove('selected');
        }
        updateSelectionUI();
    }

    function updateSelectionUI() {
        const fileCount = currentFiles.filter(f => f.type !== 'dir').length;
        const selCount = selectedFiles.size;
        selectedCountEl.textContent = `${selCount} selecionado${selCount !== 1 ? 's' : ''}`;
        deleteSelectedBtn.disabled = selCount === 0;
        selectAllCheck.checked = fileCount > 0 && selCount === fileCount;
        selectAllCheck.indeterminate = selCount > 0 && selCount < fileCount;
    }

    function toggleSelectAll() {
        const fileCheckboxes = fileList.querySelectorAll('.file-check');
        const shouldSelect = selectAllCheck.checked;
        fileCheckboxes.forEach(cb => {
            cb.checked = shouldSelect;
            handleFileCheck(cb);
        });
    }

    // --- Recursive file fetching ---
    async function getAllFilesInDir(path) {
        const files = [];
        const data = await ghFetch(`/repos/${currentRepo.full_name}/contents/${path}`);
        if (!Array.isArray(data)) return files;
        for (const item of data) {
            if (item.type === 'file') {
                files.push({ path: item.path, sha: item.sha, name: item.name });
            } else if (item.type === 'dir') {
                const subFiles = await getAllFilesInDir(item.path);
                files.push(...subFiles);
            }
        }
        return files;
    }

    // --- Delete ---
    function openDeleteModal(filesToDelete) {
        deleteModalMessage.textContent = `Você está prestes a deletar ${filesToDelete.length} arquivo${filesToDelete.length !== 1 ? 's' : ''} permanentemente. Esta ação não pode ser desfeita.`;
        deleteFileList.innerHTML = filesToDelete.map(f => `<div>📄 ${f.path}</div>`).join('');
        commitMessageInput.value = `Deletar ${filesToDelete.length} arquivo(s) via GitHub File Manager`;
        deleteModal.style.display = 'flex';

        confirmDeleteBtn.onclick = () => executeDelete(filesToDelete);
    }

    function closeDeleteModal() {
        deleteModal.style.display = 'none';
    }

    function showProgressModal(title) {
        progressTitle.textContent = title;
        progressModal.style.display = 'flex';
        progressLog.innerHTML = '';
        progressFill.style.width = '0%';
        progressText.textContent = '0%';
        progressMessage.textContent = 'Preparando...';
        // Remove any old close button
        const oldBtn = progressModal.querySelector('.progress-close-btn');
        if (oldBtn) oldBtn.remove();
    }

    function addProgressCloseBtn() {
        const closeBtn = document.createElement('button');
        closeBtn.className = 'btn btn-primary progress-close-btn';
        closeBtn.style.marginTop = '16px';
        closeBtn.textContent = 'Fechar e Atualizar';
        closeBtn.onclick = async () => {
            progressModal.style.display = 'none';
            selectedFiles.clear();
            await loadDirectory(currentPath);
        };
        progressModal.querySelector('.modal').appendChild(closeBtn);
    }

    async function executeDelete(filesToDelete) {
        closeDeleteModal();
        showProgressModal('Deletando arquivos...');
        const commitMsg = commitMessageInput.value || 'Delete files via GitHub File Manager';

        let completed = 0;
        const total = filesToDelete.length;

        for (const file of filesToDelete) {
            try {
                let sha = file.sha;
                try {
                    const latest = await ghFetch(`/repos/${currentRepo.full_name}/contents/${file.path}`);
                    sha = latest.sha;
                } catch (e) { /* file might already be deleted */ }

                await ghFetch(`/repos/${currentRepo.full_name}/contents/${file.path}`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: commitMsg, sha: sha }),
                });
                completed++;
                addProgressLog(`✓ ${file.path}`, 'success');
            } catch (e) {
                completed++;
                addProgressLog(`✕ ${file.path}: ${e.message}`, 'error');
            }
            const pct = Math.round((completed / total) * 100);
            progressFill.style.width = pct + '%';
            progressText.textContent = pct + '%';
            progressMessage.textContent = `${completed} de ${total} processados...`;
        }

        progressMessage.textContent = `Concluído! ${completed} arquivo(s) processados.`;
        showToast(`${completed} arquivo(s) deletados com sucesso!`, 'success');
        addProgressCloseBtn();
    }

    // --- Upload ---
    function readFileAsBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                // Remove data:...;base64, prefix
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    async function uploadFiles(files) {
        if (!currentRepo) return;
        showProgressModal('Enviando arquivos...');

        let completed = 0;
        const total = files.length;

        for (const file of files) {
            const filePath = currentPath ? `${currentPath}/${file.name}` : file.name;
            try {
                const content = await readFileAsBase64(file);

                // Check if file already exists (to get SHA for update)
                let sha = undefined;
                try {
                    const existing = await ghFetch(`/repos/${currentRepo.full_name}/contents/${filePath}`);
                    sha = existing.sha;
                } catch (e) { /* file doesn't exist, that's fine */ }

                const body = {
                    message: `Upload ${file.name} via GitHub File Manager`,
                    content: content,
                };
                if (sha) body.sha = sha; // update existing file

                await ghFetch(`/repos/${currentRepo.full_name}/contents/${filePath}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                completed++;
                addProgressLog(`✓ ${filePath}`, 'success');
            } catch (e) {
                completed++;
                addProgressLog(`✕ ${filePath}: ${e.message}`, 'error');
            }
            const pct = Math.round((completed / total) * 100);
            progressFill.style.width = pct + '%';
            progressText.textContent = pct + '%';
            progressMessage.textContent = `${completed} de ${total} enviados...`;
        }

        progressMessage.textContent = `Concluído! ${completed} arquivo(s) enviados.`;
        showToast(`${completed} arquivo(s) enviados com sucesso!`, 'success');
        addProgressCloseBtn();
    }

    function addProgressLog(message, type) {
        const line = document.createElement('div');
        line.className = `log-${type}`;
        line.textContent = message;
        progressLog.appendChild(line);
        progressLog.scrollTop = progressLog.scrollHeight;
    }

    async function deleteAllInCurrentDir() {
        const files = currentFiles.filter(f => f.type === 'file').map(f => ({
            path: f.path, sha: f.sha, name: f.name,
        }));

        // Also collect files from subdirectories
        const dirs = currentFiles.filter(f => f.type === 'dir');
        if (dirs.length > 0) {
            showToast('Coletando arquivos dos subdiretórios...', 'info');
            for (const dir of dirs) {
                try {
                    const subFiles = await getAllFilesInDir(dir.path);
                    files.push(...subFiles);
                } catch (e) {
                    showToast(`Erro ao acessar ${dir.path}: ${e.message}`, 'error');
                }
            }
        }

        if (files.length === 0) {
            showToast('Nenhum arquivo para deletar neste diretório', 'error');
            return;
        }
        openDeleteModal(files);
    }

    function deleteSelected() {
        const filesToDelete = [];
        selectedFiles.forEach(path => {
            const file = currentFiles.find(f => f.path === path);
            if (file) filesToDelete.push({ path: file.path, sha: file.sha, name: file.name });
        });
        if (filesToDelete.length === 0) return;
        openDeleteModal(filesToDelete);
    }

    // --- Vercel Integration ---
    async function vercelFetch(endpoint, options = {}) {
        const url = `https://api.vercel.com${endpoint}`;
        const res = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `Bearer ${vercelToken}`,
                'Content-Type': 'application/json',
                ...(options.headers || {}),
            },
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error?.message || `Vercel API error: ${res.status}`);
        }
        return res.json();
    }

    async function loadVercelProjects() {
        const data = await vercelFetch('/v9/projects?limit=100');
        vercelProjects = data.projects || [];
    }

    function findLinkedVercelProject(repoFullName) {
        if (!vercelToken || vercelProjects.length === 0) return null;
        const [owner, repoName] = repoFullName.split('/');
        return vercelProjects.find(p => {
            const link = p.link;
            if (!link || link.type !== 'github') return false;
            return link.repo === repoFullName ||
                   (link.org === owner && link.repo === repoName) ||
                   link.repoId?.toString() === repoName;
        }) || null;
    }

    function updateVercelUI() {
        if (!vercelToken) {
            vercelDeployBtn.style.display = 'none';
            vercelStatus.style.display = 'none';
            return;
        }
        if (linkedVercelProject) {
            vercelDeployBtn.style.display = 'inline-flex';
            vercelDeployBtn.disabled = false;
            vercelDeployText.textContent = `Redeploy: ${linkedVercelProject.name}`;
            vercelStatus.style.display = 'flex';
            vercelStatus.innerHTML = '<span class="dot linked"></span> Vercel vinculada';
        } else if (currentRepo) {
            vercelDeployBtn.style.display = 'none';
            vercelStatus.style.display = 'flex';
            vercelStatus.innerHTML = '<span class="dot unlinked"></span> Sem projeto Vercel';
        } else {
            vercelDeployBtn.style.display = 'none';
            vercelStatus.style.display = 'none';
        }
    }

    async function triggerVercelDeploy() {
        if (!linkedVercelProject || !currentRepo) return;
        vercelDeployBtn.disabled = true;
        vercelDeployText.textContent = 'Deploying...';
        const originalHTML = vercelDeployBtn.innerHTML;

        try {
            const branch = currentRepo.default_branch || 'main';
            // Get the GitHub repo ID
            const repoData = await ghFetch(`/repos/${currentRepo.full_name}`);
            const repoId = repoData.id;

            await vercelFetch('/v13/deployments', {
                method: 'POST',
                body: JSON.stringify({
                    name: linkedVercelProject.name,
                    project: linkedVercelProject.id,
                    gitSource: {
                        type: 'github',
                        repoId: String(repoId),
                        ref: branch,
                    },
                    target: 'production',
                }),
            });
            showToast(`Deploy iniciado para ${linkedVercelProject.name}!`, 'success');
        } catch (e) {
            showToast('Erro no deploy: ' + e.message, 'error');
        } finally {
            vercelDeployBtn.disabled = false;
            vercelDeployText.textContent = `Redeploy: ${linkedVercelProject.name}`;
        }
    }

    // --- Event Listeners ---
    connectBtn.addEventListener('click', connect);
    tokenInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') connect(); });
    toggleTokenBtn.addEventListener('click', () => {
        tokenInput.type = tokenInput.type === 'password' ? 'text' : 'password';
    });
    logoutBtn.addEventListener('click', logout);
    repoSearch.addEventListener('input', filterRepos);
    selectAllCheck.addEventListener('change', toggleSelectAll);
    deleteSelectedBtn.addEventListener('click', deleteSelected);
    deleteAllDirBtn.addEventListener('click', deleteAllInCurrentDir);
    cancelDeleteBtn.addEventListener('click', closeDeleteModal);
    uploadBtn.addEventListener('click', () => uploadInput.click());
    uploadInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) uploadFiles(files);
        uploadInput.value = '';
    });
    vercelDeployBtn.addEventListener('click', triggerVercelDeploy);
    toggleVercelBtn.addEventListener('click', () => {
        vercelTokenInput.type = vercelTokenInput.type === 'password' ? 'text' : 'password';
    });

    // Close modals on overlay click
    deleteModal.addEventListener('click', (e) => { if (e.target === deleteModal) closeDeleteModal(); });

    // --- Init ---
    initAuth();
})();
