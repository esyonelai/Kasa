const app = {
    init() {
        // Register Service Worker for PWA
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./sw.js')
                    .then(reg => {
                        console.log('SW Registered', reg);
                        // Force update if new worker found
                        reg.onupdatefound = () => {
                            const newWorker = reg.installing;
                            newWorker.onstatechange = () => {
                                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                    if (confirm('Yeni bir güncelleme var! Sayfayı yenilemek ister misiniz?')) {
                                        window.location.reload();
                                    }
                                }
                            };
                        };
                    })
                    .catch(err => console.log('SW Error', err));
            });
        }

        // Request Persistent Storage
        if (navigator.storage && navigator.storage.persist) {
            navigator.storage.persist().then(persistent => {
                if (persistent) console.log("Storage will not be cleared by browser.");
                else console.log("Storage may be cleared by browser under pressure.");
            });
        }

        this.renderDashboard();
        this.renderTransactions();
        this.updateRatesUI();
        this.renderExpenseStats();
    },

    updateRatesUI() {
        document.getElementById('usdKztRate').textContent = Store.state.rates.usdKzt + ' ₸';
        document.getElementById('tryKztRate').textContent = Store.state.rates.usdTry + ' ₺';
    },


    renderDashboard() {
        const balances = Store.getBankBalances();
        const totalKzt = Store.getTotalInKzt();

        // Bank Elements
        document.getElementById('bankKaspi').textContent = this.formatCurrency(balances.kaspi, 'KZT');
        document.getElementById('bankHalyk').textContent = this.formatCurrency(balances.halyk, 'KZT');
        document.getElementById('bankTR').textContent = this.formatCurrency(balances.tr_bank, 'TRY');

        // Grand Total (Kaspi + Halyk)
        document.getElementById('totalBalanceKzt').textContent = this.formatCurrency(totalKzt, 'KZT');

        // Pending Advances & Debts
        const pendingAdvances = Store.getPendingAdvancesTotal();
        const pendingDebts = Store.getPendingDebtsTotal();
        document.getElementById('totalPendingAdvances').textContent = this.formatCurrency(pendingAdvances, 'KZT');
        document.getElementById('totalPendingDebts').textContent = this.formatCurrency(pendingDebts, 'KZT');
    },

    renderTransactions() {
        const list = document.getElementById('transactionList');
        const search = document.getElementById('searchInput').value.toLowerCase();
        
        const filtered = Store.state.transactions.filter(tx => 
            tx.category.toLowerCase().includes(search) || 
            (tx.note && tx.note.toLowerCase().includes(search))
        );

        if (filtered.length === 0) {
            list.innerHTML = `<div class="card glass empty-state" style="text-align:center; padding: 40px;">Henüz işlem bulunamadı.</div>`;
            return;
        }

        list.innerHTML = filtered.map(tx => `
            <div class="card glass transaction-item animate-in">
                <div class="tx-icon ${tx.type}">
                    <i data-lucide="${tx.type === 'income' ? 'trending-up' : (tx.type === 'expense' ? 'trending-down' : 'repeat')}"></i>
                </div>
                <div class="tx-details">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <span class="tx-title">${tx.category}</span>
                        <div class="tx-amount ${tx.type}">
                            ${tx.type === 'expense' ? '-' : ''}${this.formatCurrency(tx.amount, tx.currency)}
                            ${tx.currency !== 'KZT' ? `<div style="font-size: 0.75rem; opacity: 0.7; font-weight: 400;">≈ ${this.formatCurrency(Store.convert(tx.amount, tx.currency, 'KZT'), 'KZT')}</div>` : ''}
                        </div>
                    </div>
                    <div class="tx-meta" style="margin-top: 5px; font-size: 0.85rem; color: var(--text-main); font-weight: 400;">
                        ${tx.note ? `<div class="tx-note" style="margin-bottom: 5px; background: rgba(255,255,255,0.03); padding: 5px 10px; border-radius: 8px;">${tx.note}</div>` : ''}
                        <span style="opacity: 0.6;">
                            ${new Date(tx.date).toLocaleDateString()} • 
                            ${tx.toBankId ? `${tx.bankId} → ${tx.toBankId}` : (tx.fromBankId ? `${tx.fromBankId} → ${tx.bankId}` : tx.bankId)}
                        </span>
                    </div>
                </div>
                <div class="tx-actions">
                    <button class="btn-icon" onclick="app.editTx(${tx.id})">
                        <i data-lucide="edit-3" style="width:16px; color: var(--primary)"></i>
                    </button>
                    <button class="btn-icon" onclick="app.deleteTx(${tx.id})">
                        <i data-lucide="trash-2" style="width:16px; color: var(--c-danger)"></i>
                    </button>
                </div>
            </div>
        `).join('');
        
        lucide.createIcons();
    },

    formatCurrency(amount, currency) {
        const symbols = { 'KZT': '₸', 'USD': '$', 'TRY': '₺' };
        return new Intl.NumberFormat('tr-TR').format(amount) + ' ' + (symbols[currency] || currency);
    },

    openTransactionModal(editingTx = null) {
        const overlay = document.getElementById('modalOverlay');
        const isEdit = !!editingTx;
        
        overlay.innerHTML = `
            <div class="card glass modal">
                <div class="modal-header">
                    <h2>${isEdit ? 'İşlemi Düzelt' : 'Yeni İşlem'}</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><i data-lucide="x"></i></button>
                </div>
                <form id="txForm" onsubmit="app.handleTxSubmit(event)">
                    <input type="hidden" id="txId" value="${isEdit ? editingTx.id : ''}">
                    <div class="form-group">
                        <label>Tarih</label>
                        <input type="date" class="glass-input" id="txDate" value="${isEdit ? new Date(editingTx.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]}" required>
                    </div>
                    <div class="form-group">
                        <label>İşlem Tipi</label>
                        <select class="glass-input" id="txType">
                            <option value="expense" ${isEdit && editingTx.type === 'expense' ? 'selected' : ''}>Gider</option>
                            <option value="income" ${isEdit && editingTx.type === 'income' ? 'selected' : ''}>Gelir</option>
                            <option value="transfer" ${isEdit && editingTx.type === 'transfer' ? 'selected' : ''}>Transfer (USD -> KZT)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Tutar</label>
                        <input type="number" step="0.01" class="glass-input" id="txAmount" value="${isEdit ? editingTx.amount : ''}" required>
                    </div>
                    <div class="form-group" id="currencyGroup">
                        <label>Para Birimi</label>
                        <select class="glass-input" id="txCurrency">
                            <option value="KZT" ${isEdit && editingTx.currency === 'KZT' ? 'selected' : ''}>KZT (₸)</option>
                            <option value="USD" ${isEdit && editingTx.currency === 'USD' ? 'selected' : ''}>USD ($)</option>
                            <option value="TRY" ${isEdit && editingTx.currency === 'TRY' ? 'selected' : ''}>TRY (₺)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Kaynak Banka</label>
                        <select class="glass-input" id="txBank">
                            <option value="kaspi" ${isEdit && editingTx.bankId === 'kaspi' ? 'selected' : ''}>Kaspi Bank</option>
                            <option value="halyk" ${isEdit && editingTx.bankId === 'halyk' ? 'selected' : ''}>Halyk Bank</option>
                            <option value="tr_bank" ${isEdit && editingTx.bankId === 'tr_bank' ? 'selected' : ''}>TR Bank</option>
                        </select>
                    </div>
                    <div class="form-group ${isEdit && editingTx.type === 'transfer' ? '' : 'hidden'}" id="toBankGroup">
                        <label>Hedef Banka</label>
                        <select class="glass-input" id="toBank">
                            <option value="kaspi" ${isEdit && editingTx.toBankId === 'kaspi' ? 'selected' : ''}>Kaspi Bank</option>
                            <option value="halyk" ${isEdit && editingTx.toBankId === 'halyk' ? 'selected' : ''}>Halyk Bank</option>
                            <option value="tr_bank" ${isEdit && editingTx.toBankId === 'tr_bank' ? 'selected' : ''}>TR Bank</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Masraf Merkezi / Kategori</label>
                        <select class="glass-input" id="txCategory">
                            ${Store.state.expenseCenters.map(c => `<option value="${c}" ${isEdit && editingTx.category === c ? 'selected' : ''}>${c}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Firma / Kişi Adı (Opsiyonel)</label>
                        <input type="text" class="glass-input" id="txContact" value="${isEdit ? (editingTx.contact || '') : ''}" placeholder="Örn: Ahmet Bey veya X Lojistik">
                    </div>
                    <div class="form-group">
                        <label>Not</label>
                        <input type="text" class="glass-input" id="txNote" value="${isEdit ? (editingTx.note || '') : ''}">
                    </div>
                    
                    <div class="card glass" id="commissionGroup" style="margin-top: 20px; padding: 15px; border: 1px dashed var(--glass-border);">
                        <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-muted); margin-bottom: 10px; display: flex; align-items: center; gap: 5px;">
                            <i data-lucide="percent" style="width:14px"></i> Komisyon (Opsiyonel)
                        </div>
                        <div style="display: grid; grid-template-columns: 2fr 1.5fr; gap: 10px;">
                            <input type="number" step="0.01" class="glass-input" id="commissionAmount" value="${isEdit ? (editingTx.commissionAmount || 0) : 0}">
                            <select class="glass-input" id="commissionCurrency">
                                <option value="KZT" ${isEdit && editingTx.commissionCurrency === 'KZT' ? 'selected' : ''}>KZT (₸)</option>
                                <option value="USD" ${isEdit && editingTx.commissionCurrency === 'USD' ? 'selected' : ''}>USD ($)</option>
                                <option value="TRY" ${isEdit && editingTx.commissionCurrency === 'TRY' ? 'selected' : ''}>TRY (₺)</option>
                            </select>
                        </div>
                    </div>
                    
                    <!-- Avans/Borç Checkbox (Sadece Gider İçin) -->
                    <div class="form-group hidden" style="background: rgba(168, 85, 247, 0.05); padding: 15px; border-radius: 12px; margin-top: 10px;" id="advanceStatusGroup">
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                            <input type="checkbox" id="isSpecialFlag" ${isEdit && (editingTx.isAdvance || editingTx.isDebt) ? 'checked' : ''} style="width: 20px; height: 20px;">
                            <label for="isSpecialFlag" style="margin: 0; font-weight: 600; cursor: pointer;">Bu bir Alacak İşlemidir (Avans/Borç)</label>
                        </div>
                        <div id="specialTypeContainer" class="${isEdit && (editingTx.isAdvance || editingTx.isDebt) ? '' : 'hidden'}" style="margin-left: 30px;">
                            <select class="glass-input" id="specialType">
                                <option value="avans" ${isEdit && editingTx.isAdvance ? 'selected' : ''}>Firma Avansı (Firmaya Verilen)</option>
                                <option value="borc" ${isEdit && editingTx.isDebt ? 'selected' : ''}>Şahıs Borcu (Şahsa Verilen)</option>
                            </select>
                        </div>
                    </div>

                    <button type="submit" class="btn-primary" style="width: 100%; justify-content: center; margin-top: 25px;">
                        ${isEdit ? 'Güncelle' : 'Kaydet'}
                    </button>
                </form>
            </div>
        `;
        overlay.classList.remove('hidden');
        lucide.createIcons();

        // Transfer seçildiğinde hedef banka alanını göster
        const txTypeElem = document.getElementById('txType');
        const txBankSelect = document.getElementById('txBank');
        const currencySelect = document.getElementById('txCurrency');

        // Banka seçildiğinde para birimini otomatik ayarla
        txBankSelect.addEventListener('change', (e) => {
            if (e.target.value === 'tr_bank') {
                currencySelect.value = 'TRY';
            } else if (e.target.value === 'kaspi' || e.target.value === 'halyk') {
                if (txTypeElem.value !== 'transfer') currencySelect.value = 'KZT';
            }
        });

        if (txTypeElem) {
            const toggleFields = () => {
                const type = txTypeElem.value;
                const toBankGroup = document.getElementById('toBankGroup');
                const commissionGroup = document.getElementById('commissionGroup');
                const currencyGroup = document.getElementById('currencyGroup');
                const advanceStatusGroup = document.getElementById('advanceStatusGroup');
                
                if (type === 'transfer') {
                    toBankGroup.classList.remove('hidden');
                    commissionGroup.classList.remove('hidden');
                    currencyGroup.classList.remove('hidden');
                    advanceStatusGroup.classList.add('hidden');
                } else if (type === 'expense') {
                    toBankGroup.classList.add('hidden');
                    commissionGroup.classList.add('hidden'); // Giderlerden komisyonu çıkardık
                    currencyGroup.classList.remove('hidden');
                    advanceStatusGroup.classList.remove('hidden');
                } else {
                    toBankGroup.classList.add('hidden');
                    commissionGroup.classList.add('hidden');
                    currencyGroup.classList.remove('hidden');
                    advanceStatusGroup.classList.add('hidden');
                }
            };

            const isSpecialFlag = document.getElementById('isSpecialFlag');
            isSpecialFlag.addEventListener('change', (e) => {
                const container = document.getElementById('specialTypeContainer');
                if (e.target.checked) container.classList.remove('hidden');
                else container.classList.add('hidden');
            });

            txTypeElem.addEventListener('change', toggleFields);
            // Initial call to set correct visibility
            toggleFields();
        }
    },

    openRatesModal() {
        const overlay = document.getElementById('modalOverlay');
        overlay.innerHTML = `
            <div class="card glass modal">
                <div class="modal-header">
                    <h2>Ayarlar ve Veri Yönetimi</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><i data-lucide="x"></i></button>
                </div>
                
                <section style="margin-bottom: 25px;">
                    <h3 style="font-size: 0.9rem; color: var(--primary); margin-bottom: 15px; border-bottom: 1px solid var(--glass-border); padding-bottom: 5px;">Günlük Kurlar</h3>
                    <form id="ratesForm" onsubmit="app.handleRatesSubmit(event)">
                        <div class="form-group">
                            <label>USD / KZT</label>
                            <input type="number" step="0.1" class="glass-input" id="rateUsdKzt" value="${Store.state.rates.usdKzt}" required>
                        </div>
                        <div class="form-group">
                            <label>USD / TRY</label>
                            <input type="number" step="0.1" class="glass-input" id="rateUsdTry" value="${Store.state.rates.usdTry}" required>
                        </div>
                        <button type="submit" class="btn-primary" style="width: 100%; justify-content: center; margin-top: 10px;">Kurları Güncelle</button>
                    </form>
                </section>

                <section>
                    <h3 style="font-size: 0.9rem; color: var(--c-usd); margin-bottom: 15px; border-bottom: 1px solid var(--glass-border); padding-bottom: 5px;">Yedekleme ve Güvenlik</h3>
                    <p style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 15px;">Verileriniz sadece bu cihazda saklanır. Güvenlik için düzenli yedek almanız önerilir.</p>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <button class="btn-secondary" onclick="app.exportBackup()" style="justify-content: center;">
                            <i data-lucide="download"></i> Yedek Al
                        </button>
                        <button class="btn-secondary" onclick="document.getElementById('importFile').click()" style="justify-content: center;">
                            <i data-lucide="upload"></i> Yedek Yükle
                        </button>
                    </div>
                    <input type="file" id="importFile" style="display:none" onchange="app.importBackup(event)" accept=".json">
                    
                    <button class="btn-secondary" onclick="app.clearAllData()" style="width: 100%; margin-top: 10px; justify-content: center; color: var(--c-danger); border-color: rgba(239, 68, 68, 0.2);">
                        <i data-lucide="trash-2"></i> Tüm Verileri Sıfırla
                    </button>
                </section>

                <section style="margin-top: 25px;">
                    <h3 style="font-size: 0.9rem; color: #a855f7; margin-bottom: 15px; border-bottom: 1px solid var(--glass-border); padding-bottom: 5px;">Masraf Merkezleri</h3>
                    <div id="categoryManager" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 15px; max-height: 200px; overflow-y: auto;">
                        ${Store.state.expenseCenters.map(cat => `
                            <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); padding: 8px 12px; border-radius: 10px;">
                                <span style="font-size: 0.85rem;">${cat}</span>
                                ${['Giderler', 'Açılış', 'Transfer'].includes(cat) ? 
                                    '<span style="font-size: 0.7rem; opacity: 0.5;">Sistem</span>' : 
                                    `<button class="btn-icon" onclick="app.handleDeleteCategory('${cat}')"><i data-lucide="trash-2" style="width:14px; color: var(--c-danger)"></i></button>`
                                }
                            </div>
                        `).join('')}
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <input type="text" id="newCategoryName" class="glass-input" placeholder="Yeni kategori..." style="flex: 1;">
                        <button class="btn-primary" onclick="app.handleAddCategory()"><i data-lucide="plus"></i> Ekle</button>
                    </div>
                </section>
            </div>
        `;
        overlay.classList.remove('hidden');
        lucide.createIcons();
    },

    exportBackup() {
        const data = JSON.stringify(Store.state, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `kasa_yedek_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        URL.revokeObjectURL(url);
    },

    importBackup(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (!data.transactions || !data.banks) throw new Error('Hatalı yedek dosyası.');
                
                if (confirm('Yedek dosyasını yüklemek istediğinize emin misiniz? Mevcut verileriniz silinecektir.')) {
                    Store.state = data;
                    Store.save();
                    location.reload();
                }
            } catch (err) {
                alert('Hata: ' + err.message);
            }
        };
        reader.readAsText(file);
    },

    clearAllData() {
        if (confirm('DİKKAT! Tüm verileriniz kalıcı olarak silinecektir. Bu işlem geri alınamaz. Emin misiniz?')) {
            localStorage.clear();
            location.reload();
        }
    },

    closeModal() {
        document.getElementById('modalOverlay').classList.add('hidden');
    },

    handleTxSubmit(event) {
        event.preventDefault();
        const txId = document.getElementById('txId').value;
        const txDate = document.getElementById('txDate').value; // Formdaki tarih
        const type = document.getElementById('txType').value;
        const amount = parseFloat(document.getElementById('txAmount').value);
        const currency = document.getElementById('txCurrency').value;
        const bankId = document.getElementById('txBank').value;
        const toBankId = document.getElementById('txType').value === 'transfer' ? document.getElementById('toBank').value : null;
        const category = document.getElementById('txCategory').value;
        const note = document.getElementById('txNote').value;
        const contact = document.getElementById('txContact').value;
        const commissionAmount = parseFloat(document.getElementById('commissionAmount').value) || 0;
        const commissionCurrency = document.getElementById('commissionCurrency').value;
        const isSpecialFlag = document.getElementById('isSpecialFlag').checked;
        const specialType = document.getElementById('specialType').value;
        
        const rateUsed = currency === 'USD' ? Store.state.rates.usdKzt : (currency === 'TRY' ? Store.state.rates.usdKzt / Store.state.rates.usdTry : 1);

        const txData = { 
            type, amount, currency, bankId, toBankId, category, note, contact, rateUsed,
            commissionAmount, commissionCurrency,
            isAdvance: type === 'expense' && isSpecialFlag && specialType === 'avans',
            advanceStatus: (type === 'expense' && isSpecialFlag && specialType === 'avans') ? 'pending' : undefined,
            isDebt: type === 'expense' && isSpecialFlag && specialType === 'borc',
            debtStatus: (type === 'expense' && isSpecialFlag && specialType === 'borc') ? 'pending' : undefined,
            date: txDate + 'T12:00:00' // Öğle vaktini varsayalım ki timezone kayması olmasın
        };

        if (txId) {
            txData.id = parseInt(txId);
            Store.updateTransaction(txData);
        } else {
            Store.addTransaction(txData);
        }

        this.closeModal();
        this.renderDashboard();
        this.renderTransactions();
        this.renderExpenseStats();
    },

    editTx(id) {
        const tx = Store.state.transactions.find(t => t.id === id);
        if (tx) {
            this.openTransactionModal(tx);
        }
    },

    handleRatesSubmit(event) {
        event.preventDefault();
        const rates = {
            usdKzt: parseFloat(document.getElementById('rateUsdKzt').value),
            usdTry: parseFloat(document.getElementById('rateUsdTry').value)
        };
        Store.saveRates(rates);
        localStorage.setItem('last_rate_update', new Date().toLocaleDateString());
        this.updateRatesUI();
        this.renderDashboard();
        this.renderExpenseStats();
        this.closeModal();
    },

    handleAddCategory() {
        const input = document.getElementById('newCategoryName');
        const name = input.value.trim();
        if (name) {
            Store.addExpenseCenter(name);
            this.openRatesModal(); // Re-render modal
        }
    },

    handleDeleteCategory(name) {
        if (confirm(`${name} kategorisini silmek istediğinize emin misiniz?`)) {
            Store.deleteExpenseCenter(name);
            this.openRatesModal(); // Re-render modal
        }
    },

    deleteTx(id) {
        if (confirm('Bu işlemi silmek istediğinize emin misiniz?')) {
            Store.deleteTransaction(id);
            this.renderDashboard();
            this.renderTransactions();
            this.renderExpenseStats();
        }
    },

    viewBankStatement(bankId, startDate = null, endDate = null) {
        const overlay = document.getElementById('modalOverlay');
        const bank = Store.state.banks.find(b => b.id === bankId);
        
        // 1. Calculate Running Balance from all history
        const allBankTx = Store.state.transactions
            .filter(t => t.bankId === bankId)
            .sort((a, b) => new Date(a.date) - new Date(b.date) || a.id - b.id);

        let running = 0;
        const ledger = allBankTx.map(t => {
            const amountInBankCurrency = Store.convert(parseFloat(t.amount), t.currency, bank.currency);
            if (t.type === 'expense') {
                running -= amountInBankCurrency;
            } else {
                running += amountInBankCurrency;
            }
            return { ...t, runningBalance: running };
        });

        // 2. Date filtering logic
        const now = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(now.getDate() - 30);
        
        const start = startDate ? new Date(startDate) : thirtyDaysAgo;
        const end = endDate ? new Date(endDate) : now;
        
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);

        const filtered = ledger.filter(tx => {
            const txDate = new Date(tx.date);
            return txDate >= start && txDate <= end;
        }).reverse(); // Newest first for view

        const balances = Store.getBankBalances();
        const currentBalance = balances[bankId];

        overlay.innerHTML = `
            <div class="card glass modal large" id="printableStatement">
                <div class="modal-header">
                    <h2>${bank.name} - Hesap Ekstresi</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><i data-lucide="x"></i></button>
                </div>

                <div class="statement-controls">
                    <div class="date-range">
                        <input type="date" class="glass-input" id="stmtStart" value="${start.toISOString().split('T')[0]}">
                        <span style="color:var(--text-muted)">-</span>
                        <input type="date" class="glass-input" id="stmtEnd" value="${end.toISOString().split('T')[0]}">
                        <button class="btn-primary" onclick="app.refreshStatement('${bankId}')">Filtrele</button>
                    </div>
                    <div class="export-btns">
                        <button class="btn-secondary" onclick="app.exportToCSV('${bankId}')">
                            <i data-lucide="file-spreadsheet"></i> Excel
                        </button>
                        <button class="btn-secondary" onclick="window.print()">
                            <i data-lucide="printer"></i> Yazdır (PDF)
                        </button>
                    </div>
                </div>

                <div class="card glass" style="margin-bottom:20px; padding: 15px; display: flex; justify-content: space-between; align-items: center;">
                    <span style="color:var(--text-muted)">Güncel Bakiye:</span>
                    <span style="font-size: 1.5rem; font-weight: 700;">${this.formatCurrency(currentBalance, bank.currency)}</span>
                </div>

                <div class="statement-table-container">
                    <table class="statement-table">
                        <thead>
                            <tr>
                                <th>Tarih</th>
                                <th>Kategori</th>
                                <th>Açıklama</th>
                                <th style="text-align:right">İşlem</th>
                                <th style="text-align:right">Bakiye</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filtered.length === 0 ? '<tr><td colspan="5" style="text-align:center; padding: 30px;">Bu dönemde işlem bulunamadı.</td></tr>' : 
                                filtered.map(tx => `
                                <tr>
                                    <td style="color:var(--text-muted)">${new Date(tx.date).toLocaleDateString()}</td>
                                    <td><span style="font-weight:500">${tx.category}</span></td>
                                    <td><span style="font-size:0.85rem; color:var(--text-muted)">${tx.note || '-'}</span></td>
                                    <td style="text-align:right; font-weight:600; color: ${tx.type === 'expense' ? 'var(--c-danger)' : 'var(--c-usd)'}">
                                        ${tx.type === 'expense' ? '-' : '+'}${this.formatCurrency(tx.amount, tx.currency)}
                                        ${tx.currency !== 'KZT' ? `<div style="font-size: 0.7rem; opacity: 0.6; font-weight: 400;">≈ ${this.formatCurrency(Store.convert(tx.amount, tx.currency, 'KZT'), 'KZT')}</div>` : ''}
                                    </td>
                                    <td style="text-align:right; font-weight:700;">
                                        ${this.formatCurrency(tx.runningBalance, bank.currency)}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        overlay.classList.remove('hidden');
        lucide.createIcons();
    },

    refreshStatement(bankId) {
        const start = document.getElementById('stmtStart').value;
        const end = document.getElementById('stmtEnd').value;
        this.viewBankStatement(bankId, start, end);
    },

    exportToCSV(bankId) {
        const bank = Store.state.banks.find(b => b.id === bankId);
        const filtered = Store.state.transactions.filter(tx => tx.bankId === bankId);
        
        let csv = 'Tarih,Kategori,Banka,Tutar,Para Birimi,Not\n';
        filtered.forEach(tx => {
            const row = [
                new Date(tx.date).toLocaleDateString(),
                tx.category,
                bank.name,
                tx.amount,
                tx.currency,
                tx.note || ''
            ].map(v => `"${v}"`).join(',');
            csv += row + '\n';
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `${bank.name}_Ekstre_${new Date().toLocaleDateString()}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    renderExpenseStats() {
        const container = document.getElementById('expenseChartContainer');
        if (!container) return;

        // Sadece 'Giderler' ve 'Transfer' tipindeki çıkışlara odaklan
        const expenses = Store.state.transactions.filter(tx => 
            tx.type === 'expense' && (tx.category === 'Giderler' || tx.category === 'Transfer')
        );
        const rt = Store.state.rates;

        if (expenses.length === 0) {
            container.innerHTML = `<div class="empty-state">Henüz gider yok</div>`;
            return;
        }

        const stats = {};
        let grandTotalKzt = 0;

        expenses.forEach(tx => {
            let amountKzt = parseFloat(tx.amount);
            if (tx.currency === 'USD') amountKzt = amountKzt * rt.usdKzt;
            else if (tx.currency === 'TRY') amountKzt = (amountKzt / rt.usdTry) * rt.usdKzt;

            // Görünüm için kategori ismini eşle
            const label = tx.category === 'Transfer' ? 'Banka Transferi' : 'Giderler';
            
            stats[label] = (stats[label] || 0) + amountKzt;
            grandTotalKzt += amountKzt;
        });

        const sorted = Object.entries(stats).sort((a, b) => b[1] - a[1]);

        container.innerHTML = sorted.map(([cat, amount]) => {
            const percent = Math.round((amount / grandTotalKzt) * 100);
            return `
                <div class="chart-item">
                    <div class="chart-info">
                        <span>${cat}</span>
                        <span class="chart-percent">${percent}%</span>
                    </div>
                    <div class="chart-bar-container">
                        <div class="chart-bar-fill" style="width: ${percent}%"></div>
                    </div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 5px;">
                        ${this.formatCurrency(amount, 'KZT')}
                    </div>
                </div>
            `;
        }).join('');
    },

    openAdvancesModal() {
        const overlay = document.getElementById('modalOverlay');
        const pending = Store.state.transactions.filter(tx => tx.isAdvance && tx.advanceStatus === 'pending');
        
        // Firma bazlı özetleri hesapla
        const firmSummaries = {};
        pending.forEach(tx => {
            if (!tx.contact) return;
            firmSummaries[tx.contact] = (firmSummaries[tx.contact] || 0) + Store.convert(parseFloat(tx.amount), tx.currency, 'KZT');
        });

        overlay.innerHTML = `
            <div class="card glass modal large" style="max-width: 950px;">
                <div class="modal-header">
                    <div>
                        <h2 style="color: #a855f7;">Firma Avansları (Alacaklar)</h2>
                        <p style="font-size: 0.85rem; color: var(--text-muted);">Sahada firmalar üzerinde bekleyen toplam teminatlarınız.</p>
                    </div>
                    <button class="btn-icon" onclick="app.closeModal()"><i data-lucide="x"></i></button>
                </div>

                <!-- Firma bazlı özet kartları -->
                <div class="contact-summary-row" style="display: flex; gap: 10px; overflow-x: auto; padding: 15px 5px; margin-bottom: 10px;">
                    ${Object.entries(firmSummaries).map(([name, balance]) => `
                        <div class="contact-card clickable" onclick="app.viewContactStatement('${name}')" style="min-width: 160px; padding: 12px;">
                            <div class="name" style="font-size: 0.85rem;">${name}</div>
                            <div class="balance" style="font-size: 1rem;">${this.formatCurrency(balance, 'KZT')}</div>
                        </div>
                    `).join('')}
                </div>
                
                <div class="table-container" style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
                        <thead style="background: rgba(255,255,255,0.05);">
                            <tr>
                                <th style="text-align:left; padding: 12px;">Tarih</th>
                                <th style="text-align:left; padding: 12px;">Firma / Kişi</th>
                                <th style="text-align:left; padding: 12px;">Not</th>
                                <th style="text-align:right; padding: 12px;">Tutar</th>
                                <th style="text-align:right; padding: 12px;">Bakiye</th>
                                <th style="text-align:right; padding: 12px;">İade Bankası</th>
                                <th style="text-align:center; padding: 12px;">İşlem</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(() => {
                                if (pending.length === 0) return '<tr><td colspan="7" style="text-align:center; padding: 40px; color: var(--text-muted);">Bekleyen avans bulunamadı.</td></tr>';
                                
                                let running = 0;
                                return pending.map(tx => {
                                    running += Store.convert(parseFloat(tx.amount), tx.currency, 'KZT');
                                    return `
                                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                                            <td style="padding: 12px;">${new Date(tx.date).toLocaleDateString('tr-TR')}</td>
                                            <td style="padding: 12px; font-weight: 600;">${tx.contact || '-'}</td>
                                            <td style="padding: 12px; color: var(--text-muted); font-size: 0.8rem;">${tx.note || tx.category}</td>
                                            <td style="padding: 12px; text-align:right; font-weight: 700; color: #a855f7;">${this.formatCurrency(tx.amount, tx.currency)}</td>
                                            <td style="padding: 12px; text-align:right; font-weight: 700; color: var(--text-main); opacity: 0.8;">${this.formatCurrency(running, 'KZT')}</td>
                                            <td style="padding: 12px; text-align:right;">
                                                <select class="glass-input" id="returnBank_${tx.id}" style="padding: 4px 8px; font-size: 0.75rem; width: 110px;">
                                                    <option value="kaspi" ${tx.bankId === 'kaspi' ? 'selected' : ''}>Kaspi Bank</option>
                                                    <option value="halyk" ${tx.bankId === 'halyk' ? 'selected' : ''}>Halyk Bank</option>
                                                    <option value="tr_bank" ${tx.bankId === 'tr_bank' ? 'selected' : ''}>TR Bank</option>
                                                </select>
                                            </td>
                                            <td style="padding: 12px; text-align:center;">
                                                <button class="btn-primary" style="padding: 6px 12px; font-size: 0.8rem;" onclick="app.handleReturnAdvance(${tx.id})">
                                                    Geri Al
                                                </button>
                                            </td>
                                        </tr>
                                    `;
                                }).join('');
                            })()}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        overlay.classList.remove('hidden');
        lucide.createIcons();
    },

    openDebtsModal() {
        const overlay = document.getElementById('modalOverlay');
        const pending = Store.state.transactions.filter(tx => tx.isDebt && tx.debtStatus === 'pending');

        // Kişi bazlı özetleri hesapla
        const personSummaries = {};
        pending.forEach(tx => {
            if (!tx.contact) return;
            personSummaries[tx.contact] = (personSummaries[tx.contact] || 0) + Store.convert(parseFloat(tx.amount), tx.currency, 'KZT');
        });

        overlay.innerHTML = `
            <div class="card glass modal large" style="max-width: 950px;">
                <div class="modal-header">
                    <div>
                        <h2 style="color: #f97316;">Verilen Borçlar (Şahıs Alacakları)</h2>
                        <p style="font-size: 0.85rem; color: var(--text-muted);">Şahıslara verdiğiniz ve geri ödemesini beklediğiniz paralar.</p>
                    </div>
                    <button class="btn-icon" onclick="app.closeModal()"><i data-lucide="x"></i></button>
                </div>

                <!-- Kişi bazlı özet kartları -->
                <div class="contact-summary-row" style="display: flex; gap: 10px; overflow-x: auto; padding: 15px 5px; margin-bottom: 10px;">
                    ${Object.entries(personSummaries).map(([name, balance]) => `
                        <div class="contact-card clickable" onclick="app.viewContactStatement('${name}')" style="min-width: 160px; padding: 12px; border-color: rgba(249, 115, 22, 0.2);">
                            <div class="name" style="font-size: 0.85rem;">${name}</div>
                            <div class="balance" style="font-size: 1rem; color: #f97316;">${this.formatCurrency(balance, 'KZT')}</div>
                        </div>
                    `).join('')}
                </div>
                
                <div class="table-container" style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
                        <thead style="background: rgba(255,255,255,0.05);">
                            <tr>
                                <th style="text-align:left; padding: 12px;">Tarih</th>
                                <th style="text-align:left; padding: 12px;">Kişi / Firma</th>
                                <th style="text-align:left; padding: 12px;">Not</th>
                                <th style="text-align:right; padding: 12px;">Tutar</th>
                                <th style="text-align:right; padding: 12px;">Bakiye</th>
                                <th style="text-align:right; padding: 12px;">İade Bankası</th>
                                <th style="text-align:center; padding: 12px;">İşlem</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(() => {
                                if (pending.length === 0) return '<tr><td colspan="7" style="text-align:center; padding: 40px; color: var(--text-muted);">Bekleyen borç bulunamadı.</td></tr>';
                                
                                let running = 0;
                                return pending.map(tx => {
                                    running += Store.convert(parseFloat(tx.amount), tx.currency, 'KZT');
                                    return `
                                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                                            <td style="padding: 12px;">${new Date(tx.date).toLocaleDateString('tr-TR')}</td>
                                            <td style="padding: 12px; font-weight: 600;">${tx.contact || '-'}</td>
                                            <td style="padding: 12px; color: var(--text-muted); font-size: 0.8rem;">${tx.note || tx.category}</td>
                                            <td style="padding: 12px; text-align:right; font-weight: 700; color: #f97316;">${this.formatCurrency(tx.amount, tx.currency)}</td>
                                            <td style="padding: 12px; text-align:right; font-weight: 700; color: var(--text-main); opacity: 0.8;">${this.formatCurrency(running, 'KZT')}</td>
                                            <td style="padding: 12px; text-align:right;">
                                                <select class="glass-input" id="payBank_${tx.id}" style="padding: 4px 8px; font-size: 0.75rem; width: 110px;">
                                                    <option value="kaspi" ${tx.bankId === 'kaspi' ? 'selected' : ''}>Kaspi Bank</option>
                                                    <option value="halyk" ${tx.bankId === 'halyk' ? 'selected' : ''}>Halyk Bank</option>
                                                    <option value="tr_bank" ${tx.bankId === 'tr_bank' ? 'selected' : ''}>TR Bank</option>
                                                </select>
                                            </td>
                                            <td style="padding: 12px; text-align:center;">
                                                <button class="btn-primary" style="background: #f97316 !important; padding: 6px 12px; font-size: 0.8rem;" onclick="app.handlePayDebt(${tx.id})">
                                                    Geri Al
                                                </button>
                                            </td>
                                        </tr>
                                    `;
                                }).join('');
                            })()}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        overlay.classList.remove('hidden');
        lucide.createIcons();
    },

    handleReturnAdvance(txId) {
        const targetBankId = document.getElementById(`returnBank_${txId}`).value;
        Store.returnAdvance(txId, targetBankId);
        
        this.renderDashboard();
        this.renderTransactions();
        this.renderExpenseStats();
        this.openAdvancesModal();
    },

    handlePayDebt(txId) {
        const sourceBankId = document.getElementById(`payBank_${txId}`).value;
        Store.payDebt(txId, sourceBankId);
        
        this.renderDashboard();
        this.renderTransactions();
        this.renderExpenseStats();
        this.openDebtsModal();
    },

    renderContactDirectory() {
        const container = document.getElementById('contactDirectory');
        if (!container) return;
        
        const summaries = Store.getContactSummaries();
        const sorted = Object.entries(summaries).sort((a, b) => b[1].balance - a[1].balance);

        if (sorted.length === 0) {
            container.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;">Henüz kayıtlı cari bulunmuyor.</div>';
            return;
        }

        container.innerHTML = sorted.map(([name, data]) => `
            <div class="contact-card clickable" onclick="app.viewContactStatement('${name}')">
                <div class="name">${name}</div>
                <div class="balance">${this.formatCurrency(data.balance, 'KZT')}</div>
                <div class="meta">${data.pendingCount} aktif işlem</div>
            </div>
        `).join('');
    },

    viewContactStatement(contactName) {
        const overlay = document.getElementById('modalOverlay');
        const txs = Store.state.transactions.filter(tx => tx.contact === contactName)
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        overlay.innerHTML = `
            <div class="card glass modal large" style="max-width: 900px;">
                <div class="modal-header">
                    <div>
                        <h2 style="color: var(--primary);">${contactName} - Hesap Ekstresi</h2>
                        <p style="font-size: 0.85rem; color: var(--text-muted);">Tüm tarihçe ve hareket dökümü.</p>
                    </div>
                    <button class="btn-icon" onclick="app.closeModal()"><i data-lucide="x"></i></button>
                </div>
                
                <div class="table-container" style="margin-top: 20px; overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
                        <thead style="background: rgba(255,255,255,0.05);">
                            <tr>
                                <th style="text-align:left; padding: 12px;">Tarih</th>
                                <th style="text-align:left; padding: 12px;">İşlem</th>
                                <th style="text-align:left; padding: 12px;">Açıklama</th>
                                <th style="text-align:right; padding: 12px;">Tutar</th>
                                <th style="text-align:right; padding: 12px;">Bakiye</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(() => {
                                let running = 0;
                                return txs.map(tx => {
                                    const amountKzt = Store.convert(parseFloat(tx.amount), tx.currency, 'KZT');
                                    if (tx.type === 'expense') running += amountKzt;
                                    else if (tx.type === 'income') running -= amountKzt;

                                    return `
                                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                                            <td style="padding: 12px;">${new Date(tx.date).toLocaleDateString('tr-TR')}</td>
                                            <td style="padding: 12px;">
                                                <span class="badge ${tx.type}">${tx.category}</span>
                                            </td>
                                            <td style="padding: 12px; color: var(--text-muted); font-size: 0.8rem;">${tx.note || '-'}</td>
                                            <td style="padding: 12px; text-align:right; font-weight: 600; color: ${tx.type === 'expense' ? 'var(--c-danger)' : 'var(--c-usd)'}">
                                                ${tx.type === 'expense' ? '-' : '+'}${this.formatCurrency(tx.amount, tx.currency)}
                                            </td>
                                            <td style="padding: 12px; text-align:right; font-weight: 700;">${this.formatCurrency(running, 'KZT')}</td>
                                        </tr>
                                    `;
                                }).join('');
                            })()}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        overlay.classList.remove('hidden');
        lucide.createIcons();
    }
};

window.app = app;
document.addEventListener('DOMContentLoaded', () => app.init());
// Search listener
document.getElementById('searchInput').addEventListener('input', () => app.renderTransactions());
