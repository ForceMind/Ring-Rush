const state = {
    token: localStorage.getItem('pelloAdminToken') || '',
    users: [],
    selectedId: null,
    page: 1,
    limit: 50,
    category: 'all',
    pagination: null,
    categories: {}
};

const $ = (id) => document.getElementById(id);

const categoryLabels = {
    all: '全部用户',
    no_record: '无战绩',
    has_record: '有战绩',
    queued: '排队中',
    active: '比赛中',
    wallet_changed: '余额变动'
};

const tokenInput = $('adminToken');
const usersBody = $('usersBody');
const detailBody = $('detailBody');
const toast = $('toast');

tokenInput.value = state.token;
$('categoryFilter').value = state.category;
$('pageSize').value = String(state.limit);

function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 2800);
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
        throw new Error(payload.message || `请求失败：${response.status}`);
    }
    return payload;
}

function formatDate(value) {
    if (!value) return '--';
    return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function setStats(stats = {}) {
    $('statUsers').textContent = stats.totalUsers ?? '--';
    $('statNoRecord').textContent = stats.noRecordUsers ?? '--';
    $('statBalance').textContent = stats.totalBalance ?? '--';
    $('statReserved').textContent = stats.totalReserved ?? '--';
    $('statMatches').textContent = stats.activeMatches ?? '--';
}

function updateCategoryOptions() {
    const select = $('categoryFilter');
    [...select.options].forEach((option) => {
        const count = state.categories?.[option.value];
        option.textContent = count === undefined
            ? categoryLabels[option.value]
            : `${categoryLabels[option.value]} (${count})`;
    });
}

function userStatus(user) {
    if (user.activeMatchId) return '<span class="badge warn">比赛中</span>';
    if (user.queued) return '<span class="badge warn">排队中</span>';
    return '<span class="badge">空闲</span>';
}

function userCategory(user) {
    if (user.noRecord) return '<span class="badge">无战绩</span>';
    if (user.matchCount > 0 || user.games > 0) return '<span class="badge strong">有战绩</span>';
    if (user.walletChanged) return '<span class="badge warn">余额变动</span>';
    return '<span class="badge">普通</span>';
}

function renderUsers() {
    const pagination = state.pagination || { page: 1, totalPages: 1, total: state.users.length };
    $('userCount').textContent = `共 ${pagination.total} 个，当前 ${state.users.length} 个`;
    $('pageInfo').textContent = `${pagination.page} / ${pagination.totalPages}`;
    $('prevPage').disabled = !pagination.hasPrev;
    $('nextPage').disabled = !pagination.hasNext;
    $('bulkDeleteNoRecord').disabled = !state.categories?.no_record;

    if (state.users.length === 0) {
        usersBody.innerHTML = '<tr><td colspan="6" class="empty-cell">没有符合条件的用户。</td></tr>';
        return;
    }

    usersBody.innerHTML = state.users.map(user => `
        <tr data-user-id="${escapeHtml(user.id)}">
            <td>
                <strong>${escapeHtml(user.displayName || '--')}</strong>
                <span class="user-id">${escapeHtml(user.id)}</span>
            </td>
            <td>
                <strong>${user.wallet?.balance ?? 0}</strong>
                <span class="user-id">预留 ${user.wallet?.reserved ?? 0}</span>
            </td>
            <td>${user.wins ?? 0}胜 / ${user.losses ?? 0}负<br><span class="user-id">积分 ${user.rating ?? '--'}，比赛 ${user.matchCount ?? 0}</span></td>
            <td>${userCategory(user)}</td>
            <td>${userStatus(user)}</td>
            <td>
                <div class="row-actions">
                    <button type="button" data-action="select" data-id="${escapeHtml(user.id)}">查看</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function resetDetail() {
    state.selectedId = null;
    $('selectedId').textContent = '未选择';
    detailBody.className = 'detail-empty';
    detailBody.textContent = '选择一个用户查看流水和最近比赛。';
}

async function loadUsers() {
    if (!state.token) {
        showToast('请先填写管理 Token');
        return;
    }

    const params = new URLSearchParams({
        limit: String(state.limit),
        page: String(state.page),
        category: state.category
    });
    const q = $('searchUsers').value.trim();
    if (q) params.set('q', q);

    const payload = await api(`/api/admin/users?${params.toString()}`);
    state.users = payload.users || [];
    state.pagination = payload.pagination || null;
    state.categories = payload.categories || {};
    setStats(payload.stats);
    updateCategoryOptions();
    renderUsers();

    if (state.selectedId && state.users.some(user => user.id === state.selectedId)) {
        await loadUserDetail(state.selectedId);
    } else {
        resetDetail();
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
            <span>分类</span><span>${user.noRecord ? '无战绩' : (user.matchCount > 0 || user.games > 0 ? '有战绩' : '普通')}</span>
            <span>创建时间</span><span>${formatDate(user.createdAt)}</span>
            <span>比赛数</span><span>${user.matchCount}</span>
        </div>
        <h3>最近流水</h3>
        <ul class="mini-list">
            ${(user.ledger || []).slice(0, 6).map(row => `
                <li>${escapeHtml(row.type)}，${row.amount >= 0 ? '+' : ''}${row.amount}，余额 ${row.balanceAfter ?? '--'}</li>
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
    showToast('用户已删除');
    await loadUsers();
}

async function bulkDeleteNoRecordUsers() {
    const count = state.categories?.no_record || 0;
    if (count <= 0) {
        showToast('没有可删除的无战绩用户');
        return;
    }
    if (!window.confirm(`确认批量删除 ${count} 个无战绩用户？只会删除没有比赛、没有余额变动、没有排队或比赛中的用户。`)) {
        return;
    }

    const payload = await api('/api/admin/users/bulk-delete-no-record', {
        method: 'POST',
        body: JSON.stringify({ limit: 5000 })
    });
    showToast(`已删除 ${payload.result.deletedCount} 个无战绩用户`);
    state.page = 1;
    await loadUsers();
}

function bind() {
    $('saveToken').addEventListener('click', () => {
        state.token = tokenInput.value.trim();
        localStorage.setItem('pelloAdminToken', state.token);
        showToast('Token 已保存');
        state.page = 1;
        loadUsers().catch(err => showToast(err.message));
    });
    $('refreshUsers').addEventListener('click', () => loadUsers().catch(err => showToast(err.message)));
    $('searchUsers').addEventListener('input', () => {
        window.clearTimeout(bind.searchTimer);
        bind.searchTimer = window.setTimeout(() => {
            state.page = 1;
            loadUsers().catch(err => showToast(err.message));
        }, 250);
    });
    $('categoryFilter').addEventListener('change', (event) => {
        state.category = event.target.value;
        state.page = 1;
        loadUsers().catch(err => showToast(err.message));
    });
    $('pageSize').addEventListener('change', (event) => {
        state.limit = Number(event.target.value) || 50;
        state.page = 1;
        loadUsers().catch(err => showToast(err.message));
    });
    $('prevPage').addEventListener('click', () => {
        if (!state.pagination?.hasPrev) return;
        state.page -= 1;
        loadUsers().catch(err => showToast(err.message));
    });
    $('nextPage').addEventListener('click', () => {
        if (!state.pagination?.hasNext) return;
        state.page += 1;
        loadUsers().catch(err => showToast(err.message));
    });
    $('bulkDeleteNoRecord').addEventListener('click', () => bulkDeleteNoRecordUsers().catch(err => showToast(err.message)));
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
