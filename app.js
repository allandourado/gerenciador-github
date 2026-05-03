// ===== GitHub File Manager App =====
(function () {
    'use strict';

    // --- State ---
    let token = '';
    let vercelToken = '';
    let vercelProjects = [];
    let selectedHookUrl = '';
    let currentUser = null;
    let repos = [];
    let currentRepo = null;
    let currentPath = '';
    let currentFiles = [];
    let selectedFiles = new Set();

    // --- DOM refs ---
    const $ = (id) => document.getElementById(id);
    
    // We'll initialize these inside an init function to ensure DOM is ready
    let authScreen, mainScreen, tokenInput, saveTokenCheck, connectBtn, toggleTokenBtn,
        logoutBtn, userAvatar, userName, repoSearch, repoList, emptyState, fileExplorer,
        breadcrumb, fileList, selectAllCheck, selectedCountEl, deleteSelectedBtn,
        deleteAllDirBtn, deleteModal, deleteModalMessage, deleteFileList,
        commitMessageInput, cancelDeleteBtn, confirmDeleteBtn, progressModal,
        progressMessage, progressFill, progressText, progressLog, progressTitle,
        universalUploadZone, uploadInput, refreshBtn, vercelTokenInput, toggleVercelBtn, vercelProjectSelect,
        vercelHookSelect, vercelSelectors, vercelDeployBtn, vercelDeployText, vercelStatus;

    function initDOMRefs() {
        authScreen = $('auth-screen');
        mainScreen = $('main-screen');
        tokenInput = $('token-input');
        saveTokenCheck = $('save-token-check');
        connectBtn = $('connect-btn');
        toggleTokenBtn = $('toggle-token-visibility');
        logoutBtn = $('logout-btn');
        userAvatar = $('user-avatar');
        userName = $('user-name');
        repoSearch = $('repo-search');
        repoList = $('repo-list');
        emptyState = $('empty-state');
        fileExplorer = $('file-explorer');
        breadcrumb = $('breadcrumb');
        fileList = $('file-list');
        selectAllCheck = $('select-all-check');
        selectedCountEl = $('selected-count');
        deleteSelectedBtn = $('delete-selected-btn');
        deleteAllDirBtn = $('delete-all-dir-btn');
        deleteModal = $('delete-modal');
        deleteModalMessage = $('delete-modal-message');
        deleteFileList = $('delete-file-list');
        commitMessageInput = $('commit-message');
        cancelDeleteBtn = $('cancel-delete-btn');
        confirmDeleteBtn = $('confirm-delete-btn');
        progressModal = $('progress-modal');
        progressMessage = $('progress-message');
        progressFill = $('progress-fill');
        progressText = $('progress-text');
        progressLog = $('progress-log');
        progressTitle = $('progress-title');
        universalUploadZone = $('universal-upload-zone');
        uploadInput = $('upload-input');
        refreshBtn = $('refresh-btn');
        vercelTokenInput = $('vercel-token-input');
        toggleVercelBtn = $('toggle-vercel-visibility');
        vercelProjectSelect = $('vercel-project-select');
        vercelHookSelect = $('vercel-hook-select');
        vercelSelectors = $('vercel-selectors');
        vercelDeployBtn = $('vercel-deploy-btn');
        vercelDeployText = $('vercel-deploy-text');
        vercelStatus = $('vercel-status');

        // Safety check
        const critical = { tokenInput, connectBtn, vercelTokenInput };
        for (const [name, el] of Object.entries(critical)) {
            if (!el) console.error(`Erro: Elemento '${name}' não encontrado no DOM!`);
        }
    }

    // --- API Helper ---
    async function ghFetch(endpoint, options = {}) {
        const url = endpoint.startsWith('http') ? endpoint : `https://api.github.com${endpoint}`;
        // Cache busting: adiciona um timestamp para evitar dados antigos
        const separator = url.includes('?') ? '&' : '?';
        const finalUrl = `${url}${separator}t=${Date.now()}`;

        const res = await fetch(finalUrl, {
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
    async function initAuth() {
        const savedToken = localStorage.getItem('ghfm_token');
        const savedVercel = localStorage.getItem('ghfm_vercel_token');
        
        if (savedToken) {
            // Tokens encontrados - vai direto para a tela principal sem mostrar login
            tokenInput.value = savedToken;
            saveTokenCheck.checked = true;
            if (savedVercel) vercelTokenInput.value = savedVercel;
            
            await connect(true);
        } else {
            // Sem tokens - mostra a tela de login
            authScreen.classList.add('active');
        }
    }

    async function connect(isSilent = false) {
        const t = tokenInput.value.trim();
        const v = vercelTokenInput.value.trim();
        
        if (!t) return;

        if (!isSilent) {
            connectBtn.disabled = true;
            connectBtn.innerHTML = '<div class="spinner" style="width:20px;height:20px;border-width:2px;"></div> Conectando...';
        }

        try {
            token = t;
            currentUser = await ghFetch('/user');
            vercelToken = v;

            // Salva sempre que houver sucesso
            if (saveTokenCheck.checked) {
                localStorage.setItem('ghfm_token', t);
                localStorage.setItem('ghfm_vercel_token', v);
            }

            if (vercelToken) {
                await loadVercelProjects().catch(e => console.error('Vercel error:', e));
            }

            showMainScreen();
            if (!isSilent) showToast(`Bem-vindo, ${currentUser.login}!`, 'success');
        } catch (e) {
            console.error('Erro na conexão:', e);
            if (isSilent) {
                // Auto-login falhou (token expirado?) - mostra tela de login
                authScreen.classList.add('active');
            } else {
                showToast('Erro na conexão: ' + e.message, 'error');
            }
        } finally {
            if (!isSilent) {
                connectBtn.disabled = false;
                connectBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg> Conectar ao GitHub`;
            }
        }
    }

    // --- Real-time saving for local files ---
    function setupInstantSave() {
        const save = () => {
            if (saveTokenCheck.checked) {
                localStorage.setItem('ghfm_token', tokenInput.value.trim());
                localStorage.setItem('ghfm_vercel_token', vercelTokenInput.value.trim());
            }
        };
        tokenInput.addEventListener('input', save);
        vercelTokenInput.addEventListener('input', save);
    }

    function logout() {
        token = '';
        vercelToken = '';
        vercelProjects = [];
        selectedHookUrl = '';
        repos = [];
        currentRepo = null;
        currentPath = '';
        currentFiles = [];
        selectedFiles.clear();

        mainScreen.classList.remove('active');
        authScreen.classList.add('active');
        
        vercelDeployBtn.style.display = 'none';
        vercelStatus.style.display = 'none';
        vercelSelectors.style.display = 'none';
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

            // Run Health Check if in root
            if (path === '') {
                checkRepoHealth(data);
            }
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
                    <label class="checkbox-wrapper file-checkbox" onclick="event.stopPropagation()">
                        <input type="checkbox" class="file-check" data-path="${f.path}" data-sha="${f.sha}" data-name="${f.name}" data-type="${f.type}">
                        <span class="checkbox-custom"></span>
                    </label>
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
                
                // Se for pasta e clicar no nome/ícone, navega
                // Se clicar em qualquer outro lugar ou se for arquivo, marca o checkbox
                const type = item.dataset.type;
                const isClickOnNav = e.target.closest('.file-info') || e.target.closest('.file-icon');
                
                if (type === 'dir' && isClickOnNav) {
                    loadDirectory(item.dataset.path);
                } else {
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
        const totalCount = currentFiles.length;
        const selCount = selectedFiles.size;
        selectedCountEl.textContent = `${selCount} selecionado${selCount !== 1 ? 's' : ''}`;
        deleteSelectedBtn.disabled = selCount === 0;
        selectAllCheck.checked = totalCount > 0 && selCount === totalCount;
        selectAllCheck.indeterminate = selCount > 0 && selCount < totalCount;
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
    async function openDeleteModal(itemsToDelete) {
        showToast('Preparando exclusão...', 'info');
        
        const finalFilesToDelete = [];
        for (const item of itemsToDelete) {
            if (item.type === 'dir') {
                try {
                    const subFiles = await getAllFilesInDir(item.path);
                    finalFilesToDelete.push(...subFiles);
                } catch (e) {
                    showToast(`Erro ao ler pasta ${item.name}: ${e.message}`, 'error');
                }
            } else {
                finalFilesToDelete.push(item);
            }
        }

        if (finalFilesToDelete.length === 0) {
            showToast('Nenhum arquivo encontrado para deletar.', 'info');
            return;
        }

        deleteModalMessage.textContent = `Você está prestes a deletar ${finalFilesToDelete.length} arquivo${finalFilesToDelete.length !== 1 ? 's' : ''} permanentemente. Esta ação não pode ser desfeita.`;
        deleteFileList.innerHTML = finalFilesToDelete.map(f => `<div>📄 ${f.path}</div>`).join('');
        commitMessageInput.value = `Deletar ${finalFilesToDelete.length} arquivo(s) via GitHub File Manager`;
        deleteModal.style.display = 'flex';

        confirmDeleteBtn.onclick = () => executeDelete(finalFilesToDelete);
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
        showToast(`${completed} arquivo(s) processados com sucesso!`, 'success');
        addProgressCloseBtn();

        // Recarrega automaticamente após 2 segundos
        setTimeout(async () => {
            try {
                showToast('Atualizando lista de arquivos...', 'info');
                selectedFiles.clear();
                await loadDirectory(currentPath);
                progressModal.style.display = 'none'; // Fecha sozinho para mostrar o resultado
                showToast('Lista atualizada!', 'success');
            } catch (err) {
                console.error('Erro ao atualizar:', err);
            }
        }, 2000);
    }

    // VERSION: 2.0 - Optimized Binary Reading
    console.log("%c GitHub File Manager v2.0 - Ativo ", "background: #6366f1; color: white; font-weight: bold; padding: 4px;");

    // --- Upload ---
    async function readFileAsBase64(file) {
        try {
            // Usa a API moderna arrayBuffer() que é mais estável que FileReader para arquivos grandes
            const buffer = await file.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            
            const len = bytes.byteLength;
            let binary = '';
            for (let i = 0; i < len; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            
            return window.btoa(binary);
        } catch (e) {
            throw new Error("Falha ao processar binário: " + e.message);
        }
    }

    async function uploadFiles(files) {
        if (!currentRepo) return;
        
        // Filtra arquivos indesejados e entradas de diretório do dt.files
        const filteredFiles = files.filter(file => {
            const path = file.relativePath || file.webkitRelativePath || file.name;
            const pathParts = path.split('/');
            
            // Ignora pastas de sistema (apenas a pasta exata .git ou node_modules, permitindo .gitignore)
            if (pathParts.includes('.git') || pathParts.includes('node_modules') || pathParts.includes('.next')) return false;
            
            // Ignora entradas de diretório (dt.files inclui pastas como File com size=0 e type vazio)
            if (file.size === 0 && file.type === '') return false;
            
            return true;
        });

        if (filteredFiles.length === 0) {
            showToast('Nenhum arquivo válido encontrado para upload.', 'info');
            return;
        }

        showProgressModal('Preparando envio...');
        
        const total = files.length;
        let completed = 0;
        let success = 0;
        let failed = 0;

        progressMessage.textContent = `Iniciando upload de ${total} arquivo(s)...`;
        
        for (const file of filteredFiles) {
            const relativePath = file.relativePath || file.webkitRelativePath || file.name;
            const filePath = currentPath ? `${currentPath}/${relativePath}` : relativePath;
            
            try {
                if (file.size > 25 * 1024 * 1024) {
                    throw new Error(`Arquivo muito grande (${formatBytes(file.size)}). O limite do GitHub via API é 25MB.`);
                }

                progressMessage.textContent = `Enviando: ${relativePath} (${completed + 1}/${total})`;
                
                const content = await readFileAsBase64(file);

                // Tenta obter o SHA se o arquivo já existir
                let sha = undefined;
                try {
                    const encodedPath = filePath.split('/').map(s => encodeURIComponent(s)).join('/');
                    const existing = await ghFetch(`/repos/${currentRepo.full_name}/contents/${encodedPath}?t=${Date.now()}`);
                    if (existing && !Array.isArray(existing)) {
                        sha = existing.sha;
                    }
                } catch (e) { }

                const body = {
                    message: `Upload ${relativePath} via GitHub File Manager`,
                    content: content,
                    branch: currentRepo.default_branch || 'main'
                };
                if (sha) body.sha = sha;

                const encodedPath = filePath.split('/').map(s => encodeURIComponent(s)).join('/');
                await ghFetch(`/repos/${currentRepo.full_name}/contents/${encodedPath}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                
                success++;
                addProgressLog(`✓ Sucesso: ${relativePath}`, 'success');
            } catch (e) {
                failed++;
                addProgressLog(`✕ Erro: ${relativePath} - ${e.message}`, 'error');
            }
            
            completed++;
            const pct = Math.round((completed / total) * 100);
            progressFill.style.width = pct + '%';
            progressText.textContent = pct + '%';
        }

        progressMessage.textContent = `Concluído: ${success} sucesso, ${failed} erro(s).`;
        showToast(`Processo finalizado: ${success} arquivos enviados.`, success > 0 ? 'success' : 'error');
        addProgressCloseBtn();

        if (success > 0) {
            setTimeout(async () => {
                try {
                    await loadDirectory(currentPath);
                    progressModal.style.display = 'none';
                } catch (err) { }
            }, 3000);
        }
    }

    // --- Drag & Drop Support ---
    async function handleDrop(e) {
        e.preventDefault();
        fileList.classList.remove('drag-over');
        
        if (!currentRepo) {
            showToast('Selecione um repositório primeiro!', 'error');
            return;
        }

        const dt = e.dataTransfer;
        const filesToUpload = [];

        showProgressModal('Processando itens...');
        progressMessage.textContent = 'Lendo arquivos e pastas...';

        // Tenta usar a nova File System Access API (getAsFileSystemHandle) se disponível
        // Isso resolve o erro de "malformed URI" do webkitGetAsEntry
        let usedModernAPI = false;
        
        if (dt.items && dt.items.length > 0 && typeof dt.items[0].getAsFileSystemHandle === 'function') {
            try {
                usedModernAPI = true;
                
                // IMPORTANTE: Coletar as Promises sincronamente porque dt.items morre após o primeiro await!
                const handlePromises = [];
                for (let i = 0; i < dt.items.length; i++) {
                    handlePromises.push(dt.items[i].getAsFileSystemHandle());
                }
                
                // Agora esperamos todas elas resolverem
                const resolvedHandles = await Promise.all(handlePromises);
                const handles = resolvedHandles.filter(h => h !== null && h !== undefined);

                async function traverseHandle(handle, path) {
                    if (handle.kind === 'file') {
                        const file = await handle.getFile();
                        file.relativePath = path ? `${path}/${file.name}` : file.name;
                        filesToUpload.push(file);
                        addProgressLog(`+ ${file.relativePath} (${(file.size / 1024).toFixed(1)} KB)`, 'success');
                    } else if (handle.kind === 'directory') {
                        const dirName = handle.name;
                        if (dirName === '.git' || dirName === 'node_modules' || dirName === '.next') {
                            addProgressLog(`⊘ Ignorado: ${dirName} (pasta de sistema)`, 'error');
                            return;
                        }
                        addProgressLog(`📁 Entrando em: ${path ? path + '/' : ''}${dirName}`, 'success');
                        
                        for await (const entry of handle.values()) {
                            await traverseHandle(entry, path ? `${path}/${dirName}` : dirName);
                        }
                    }
                }

                for (const handle of handles) {
                    await traverseHandle(handle, '');
                }
            } catch (err) {
                addProgressLog(`⚠ Falha na API Moderna: ${err.message}`, 'error');
                usedModernAPI = false; // Falhou, vai pro fallback
            }
        }

        // Fallback para dt.files (arquivos simples) se a API moderna falhar ou não existir
        if (!usedModernAPI || filesToUpload.length === 0) {
            const allFiles = Array.from(dt.files || []);
            const realFiles = allFiles.filter(f => !(f.size === 0 && f.type === ''));
            const skippedDirs = allFiles.length - realFiles.length;
            
            if (skippedDirs > 0) {
                addProgressLog(`⊘ ${skippedDirs} pasta(s) ignorada(s). (Navegador não suporta leitura de pastas arrastadas aqui. Use o botão 'Clique')`, 'error');
            }
            
            for (const f of realFiles) {
                filesToUpload.push(f);
                addProgressLog(`+ ${f.name} (${(f.size / 1024).toFixed(1)} KB)`, 'success');
            }
        }
        
        progressMessage.textContent = `${filesToUpload.length} arquivo(s) prontos para envio.`;
        
        if (filesToUpload.length > 0) {
            await uploadFiles(filesToUpload);
        } else {
            addProgressLog('⚠ Nenhum arquivo válido para enviar.', 'error');
            addProgressLog('Arraste arquivos válidos ou clique na zona para pastas.', 'error');
            addProgressCloseBtn();
        }
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
        renderVercelProjects();
        vercelSelectors.style.display = 'flex';
    }

    function renderVercelProjects() {
        vercelProjectSelect.innerHTML = '<option value="">Escolher Projeto Vercel</option>' +
            vercelProjects.map(p => {
                const repo = p.link?.repo || '';
                return `<option value="${p.id}" data-name="${p.name}" data-repo="${repo}">${p.name}</option>`;
            }).join('');
    }

    function onProjectSelected(projectId) {
        if (!projectId) {
            selectedHookUrl = '';
            vercelHookSelect.style.display = 'none';
            updateVercelUI();
            return;
        }
        // Encontra o projeto selecionado
        const project = vercelProjects.find(p => p.id === projectId);
        if (project) {
            selectedHookUrl = projectId; // Reusa essa variável para guardar o projeto selecionado
            vercelHookSelect.style.display = 'none'; // Sem hook select — deploy direto
            updateVercelUI();
        }
    }

    function updateVercelUI(statusInfo = null) {
        if (!selectedHookUrl) {
            vercelDeployBtn.style.display = 'none';
            vercelStatus.style.display = 'none';
            return;
        }

        vercelDeployBtn.style.display = 'inline-flex';
        vercelStatus.style.display = 'flex';
        
        if (statusInfo) {
            vercelDeployBtn.disabled = statusInfo.working;
            vercelDeployText.textContent = statusInfo.text;
            
            let dotClass = 'linked';
            if (statusInfo.state === 'LOADING') dotClass = 'loading';
            if (statusInfo.state === 'ERROR') dotClass = 'unlinked';
            if (statusInfo.state === 'SUCCESS') dotClass = 'success';
            
            vercelStatus.innerHTML = `<span class="dot ${dotClass}"></span> ${statusInfo.label}`;
        } else {
            const project = vercelProjects.find(p => p.id === selectedHookUrl);
            vercelDeployBtn.disabled = false;
            vercelDeployText.textContent = `Redeploy ${project?.name || ''}`;
            vercelStatus.innerHTML = '<span class="dot linked"></span> Projeto selecionado';
        }
    }

    async function triggerVercelDeploy() {
        if (!selectedHookUrl) return;
        const projectId = selectedHookUrl;
        const project = vercelProjects.find(p => p.id === projectId);
        if (!project) return;
        
        updateVercelUI({
            working: true,
            text: 'Iniciando...',
            label: 'Criando deploy...',
            state: 'LOADING'
        });

        try {
            const link = project.link;
            if (!link || link.type !== 'github') {
                throw new Error('Este projeto não está vinculado a um repositório GitHub');
            }

            const repoId = link.repoId;
            const ref = link.productionBranch || project.productionDeploymentBranch || 'main';

            const result = await vercelFetch('/v13/deployments', {
                method: 'POST',
                body: JSON.stringify({
                    name: project.name,
                    project: projectId,
                    target: 'production',
                    gitSource: {
                        type: 'github',
                        repoId: String(repoId),
                        ref: ref,
                    },
                }),
            });

            updateVercelUI({
                working: false,
                text: 'Deploy Criado!',
                label: `Pronto: ${result.url || 'em fila'}`,
                state: 'SUCCESS'
            });
            showToast(`Redeploy de "${project.name}" iniciado com sucesso!`, 'success');
            setTimeout(() => updateVercelUI(), 5000);
        } catch (e) {
            showToast('Erro no redeploy: ' + e.message, 'error');
            updateVercelUI({
                working: false,
                text: 'Erro',
                label: e.message,
                state: 'ERROR'
            });
        }
    }

    // --- Health Check Logic ---
    function checkRepoHealth(files) {
        const hasVite = files.some(f => f.name.includes('vite.config'));
        const hasPackage = files.some(f => f.name === 'package.json');
        const banner = $('health-banner');
        const title = $('health-title');
        const msg = $('health-message');
        const fixBtn = $('health-fix-btn');

        if (hasVite && !hasPackage) {
            banner.style.display = 'flex';
            title.textContent = '⚠️ Erro de Build Provável na Vercel';
            msg.textContent = 'Você tem um "vite.config", mas falta o "package.json". Delete o arquivo vite.config para o site funcionar como HTML simples.';
            
            const viteFile = files.find(f => f.name.includes('vite.config'));
            fixBtn.onclick = () => {
                if (confirm(`Deseja deletar o arquivo ${viteFile.name} para corrigir o deploy?`)) {
                    executeDelete([{ path: viteFile.path, sha: viteFile.sha, name: viteFile.name }]);
                }
            };
        } else {
            banner.style.display = 'none';
        }
    }

    // --- Init ---
    function startApp() {
        initDOMRefs();
        setupInstantSave();
        
        // --- Event Listeners ---
        connectBtn.addEventListener('click', () => connect());
        tokenInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') connect(); });
        toggleTokenBtn.addEventListener('click', () => {
            tokenInput.type = tokenInput.type === 'password' ? 'text' : 'password';
        });
        logoutBtn.addEventListener('click', logout);
        repoSearch.addEventListener('input', filterRepos);
        selectAllCheck.addEventListener('change', (e) => {
            const checked = e.target.checked;
            const checkboxes = fileList.querySelectorAll('.file-check');
            checkboxes.forEach(cb => {
                cb.checked = checked;
                const path = cb.dataset.path;
                if (checked) {
                    selectedFiles.add(path);
                    cb.closest('.file-item').classList.add('selected');
                } else {
                    selectedFiles.delete(path);
                    cb.closest('.file-item').classList.remove('selected');
                }
            });
            updateSelectionUI();
        });
        deleteSelectedBtn.addEventListener('click', () => {
            const filesToDelete = currentFiles.filter(f => selectedFiles.has(f.path));
            openDeleteModal(filesToDelete);
        });
        deleteAllDirBtn.addEventListener('click', () => {
            const filesToDelete = currentFiles.filter(f => f.type === 'file');
            openDeleteModal(filesToDelete);
        });
        cancelDeleteBtn.addEventListener('click', closeDeleteModal);
        confirmDeleteBtn.addEventListener('click', async () => {
            const files = JSON.parse(deleteFileList.dataset.files);
            await executeDelete(files);
        });
        universalUploadZone.addEventListener('click', () => {
            $('upload-folder-input').click();
        });
        $('upload-folder-input').addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            if (files.length > 0) uploadFiles(files);
            e.target.value = '';
        });

        $('clear-cache-btn').addEventListener('click', () => {
            if (confirm('Isso limpará todos os dados locais e deslogará sua conta. Continuar?')) {
                localStorage.clear();
                if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
                }
                location.reload(true);
            }
        });

        refreshBtn.addEventListener('click', () => {
            if (currentRepo) loadDirectory(currentPath);
        });

        // --- Drag & Drop Events (Universal Zone) ---
        universalUploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            universalUploadZone.classList.add('drag-over');
        });
        universalUploadZone.addEventListener('dragleave', () => {
            universalUploadZone.classList.remove('drag-over');
        });
        universalUploadZone.addEventListener('drop', (e) => {
            universalUploadZone.classList.remove('drag-over');
            handleDrop(e);
        });
        fileList.addEventListener('dragover', (e) => {
            e.preventDefault();
            fileList.classList.add('drag-over');
        });
        fileList.addEventListener('dragleave', () => {
            fileList.classList.remove('drag-over');
        });
        fileList.addEventListener('drop', handleDrop);

        vercelDeployBtn.addEventListener('click', triggerVercelDeploy);
        vercelProjectSelect.addEventListener('change', (e) => {
            onProjectSelected(e.target.value);
        });
        toggleVercelBtn.addEventListener('click', () => {
            vercelTokenInput.type = vercelTokenInput.type === 'password' ? 'text' : 'password';
        });

        // Close modals on overlay click
        deleteModal.addEventListener('click', (e) => { if (e.target === deleteModal) closeDeleteModal(); });

        initAuth();
    }

    // Run now or when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startApp);
    } else {
        startApp();
    }

})();
