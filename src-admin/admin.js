const state = {
    token: localStorage.getItem('pelloAdminToken') || '',
    users: [],
    selectedId: null
};

const $ = (id) => document.getElementById(id);

const tokenInput = $('adminToken');
const usersBody = $('usersBody');
const detailBody = $('detailBody');
const toast = $('toast');

tokenInput.value = state.token;

function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 2600);
}

async function api(path, options = {}) {
    const headers = {
        'X-Pello-Admin-Token': state.token,
        ...(options.headers || {})
    };
    if (options.body && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }
    const response = await fetch(path, {
        ...options,
        headers,
        cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
        throw new Error(payload.message || `Request failed: ${response.status}`);
    }
    return payload;
}

function formatDate(value) {
    if (!value) return '--';
    return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function setStats(stats = {}) {
    $('statUsers').textContent = stats.totalUsers ?? '--';
    $('statBalance').textContent = stats.totalBalance ?? '--';
    $('statReserved').textContent = stats.totalReserved ?? '--';
    $('statMatches').textContent = stats.activeMatches ?? '--';
}

function userStatus(user) {
    if (user.activeMatchId) return '<span class="badge warn">比赛中</span>';
    if (user.queued) return '<span class="badge warn">排队中</span>';
    return '<span class="badge">空闲</span>';
}

function renderUsers() {
    $('userCount').textContent = `${state.users.length} 个用户`;
    usersBody.innerHTML = state.users.map(user => `
        <tr data-user-id="${user.id}">
            <td>
                <strong>${escapeHtml(user.displayName || '--')}</strong>
                <span class="user-id">${escapeHtml(user.id)}</span>
            </td>
            <td>
                <strong>${user.wallet?.balance ?? 0}</strong>
                <span class="user-id">预留 ${user.wallet?.reserved ?? 0}</span>
            </td>
            <td>${user.wins ?? 0}胜 / ${user.losses ?? 0}负<br><span class="user-id">积分 ${user.rating ?? '--'}</span></td>
            <td>${userStatus(user)}</td>
            <td>
                <div class="row-actions">
                    <button type="button" data-action="select" data-id="${user.id}">查看</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function loadUsers() {
    if (!state.token) {
        showToast('请先填写管理 Token');
        return;
    }
    const q = $('searchUsers').value.trim();
    const payload = await api(`/api/admin/users?limit=300&q=${encodeURIComponent(q)}`);
    state.users = payload.users || [];
    setStats(payload.stats);
    renderUsers();
    if (state.selectedId && state.users.some(user => user.id === state.selectedId)) {
        await loadUserDetail(state.selectedId);
    } else {
        state.selectedId = null;
        $('selectedId').textContent = '未选择';
        detailBody.className = 'detail-empty';
        detailBody.textContent = '选择一个用户查看流水和最近比赛。';
    }
}

async function loadUserDetail(accountId) {
    const payload = await api(`/api/admin/users/${encodeURIComponent(accountId)}`);
    const user = payload.user;
    state.selectedId = user.id;
    $('selectedId').textContent = user.id;
    detailBody.className = 'detail-content';
    detailBody.innerHTML = `
        <div class="kv">
            <span>名称</span><span>${escapeHtml(user.displayName || '--')}</span>
            <span>金币</span><span>${user.wallet.balance}，预留 ${user.wallet.reserved}</span>
            <span>战绩</span><span>${user.wins}胜 / ${user.losses}负，积分 ${user.rating}</span>
            <span>创建时间</span><span>${formatDate(user.createdAt)}</span>
            <span>比赛数</span><span>${user.matchCount}</span>
        </div>
        <h3>最近流水</h3>
        <ul class="mini-list">
            ${(user.ledger || []).slice(0, 6).map(row => `
                <li>${escapeHtml(row.type)}：${row.amount >= 0 ? '+' : ''}${row.amount}，余额 ${row.balanceAfter ?? '--'}</li>
            `).join('') || '<li>暂无流水</li>'}
        </ul>
        <h3>最近比赛</h3>
        <ul class="mini-list">
            ${(user.matches || []).slice(0, 6).map(match => `
                <li>${escapeHtml(match.mode)} / ${escapeHtml(match.result)} / ${escapeHtml(match.state)} / ${formatDate(match.settledAt || match.abandonedAt || match.createdAt)}</li>
            `).join('') || '<li>暂无比赛</li>'}
        </ul>
    `;
}

async function walletAction(action) {
    if (!state.selectedId) {
        showToast('请先选择用户');
        return;
    }
    const amount = Number($('coinAmount').value);
    const body = action === 'reset' ? { action } : { action, amount };
    const payload = await api(`/api/admin/users/${encodeURIComponent(state.selectedId)}/wallet`, {
        method: 'POST',
        body: JSON.stringify(body)
    });
    showToast('金币已更新');
    await loadUsers();
    await loadUserDetail(payload.result.id);
}

async function resetSelectedUser() {
    if (!state.selectedId) {
        showToast('请先选择用户');
        return;
    }
    if (!window.confirm('确认重置这个用户的战绩和金币？')) return;
    const payload = await api(`/api/admin/users/${encodeURIComponent(state.selectedId)}/reset`, {
        method: 'POST',
        body: '{}'
    });
    showToast('用户已重置');
    await loadUsers();
    await loadUserDetail(payload.result.id);
}

async function deleteSelectedUser() {
    if (!state.selectedId) {
        showToast('请先选择用户');
        return;
    }
    if (!window.confirm('确认删除这个用户？此操作不可恢复。')) return;
    const deletingId = state.selectedId;
    await api(`/api/admin/users/${encodeURIComponent(deletingId)}/delete`, {
        method: 'POST',
        body: '{}'
    });
    state.selectedId = null;
    showToast('用户已删除');
    await loadUsers();
}

function bind() {
    $('saveToken').addEventListener('click', () => {
        state.token = tokenInput.value.trim();
        localStorage.setItem('pelloAdminToken', state.token);
        showToast('Token 已保存');
        loadUsers().catch(err => showToast(err.message));
    });
    $('refreshUsers').addEventListener('click', () => loadUsers().catch(err => showToast(err.message)));
    $('searchUsers').addEventListener('input', () => {
        window.clearTimeout(bind.searchTimer);
        bind.searchTimer = window.setTimeout(() => loadUsers().catch(err => showToast(err.message)), 250);
    });
    usersBody.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-action="select"]');
        if (!button) return;
        loadUserDetail(button.dataset.id).catch(err => showToast(err.message));
    });
    $('addCoins').addEventListener('click', () => walletAction('add').catch(err => showToast(err.message)));
    $('setCoins').addEventListener('click', () => walletAction('set').catch(err => showToast(err.message)));
    $('resetWallet').addEventListener('click', () => walletAction('reset').catch(err => showToast(err.message)));
    $('resetUser').addEventListener('click', () => resetSelectedUser().catch(err => showToast(err.message)));
    $('deleteUser').addEventListener('click', () => deleteSelectedUser().catch(err => showToast(err.message)));
}

bind();
if (state.token) {
    loadUsers().catch(err => showToast(err.message));
}
