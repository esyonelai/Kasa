const app = {
    deferredPrompt: null,

    init() {
        // Handle PWA Install Prompt
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
        });

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

            openAnalyticsModal(month = null, year = null) {
        const overlay = document.getElementById('modalOverlay');
        const now = new Date();
        const currentYear = year || now.getFullYear();
        const currentMonth = month !== null ? parseInt(month) : now.getMonth() + 1;

        const bankStats = {};
        Store.state.banks.forEach(b => {
            bankStats[b.id] = { name: b.name, income: 0, expense: 0, currency: b.currency, isHidden: b.isHidden };
        });

        Store.state.transactions.forEach(tx => {
            const txDate = new Date(tx.date);
            const txYear = txDate.getFullYear();
            const txMonth = txDate.getMonth() + 1;

            const matchesYear = txYear === parseInt(currentYear);
            const matchesMonth = currentMonth === 0 || txMonth === currentMonth;

            if (matchesYear && matchesMonth) {
                const bFrom = bankStats[tx.bankId];
                const bTo = tx.toBankId ? bankStats[tx.toBankId] : null;

                if (tx.type === 'income' && bFrom) {
                    bFrom.income += parseFloat(tx.amount);
                } else if (tx.type === 'expense' && bFrom) {
                    bFrom.expense += parseFloat(tx.amount);
                } else if (tx.type === 'transfer') {
                    if (bFrom) bFrom.expense += parseFloat(tx.amount);
                    if (bTo) bTo.income += parseFloat(tx.amount);
                }
            }
        });

        const totalIncomeKzt = Object.values(bankStats).reduce((acc, b) => acc + Store.convert(b.income, b.currency, 'KZT'), 0);
        const totalExpenseKzt = Object.values(bankStats).reduce((acc, b) => acc + Store.convert(b.expense, b.currency, 'KZT'), 0);

        const bankCardsHtml = Object.keys(bankStats).map(id => {
            const b = bankStats[id];
            if (b.income === 0 && b.expense === 0) return ''; 

            const net = b.income - b.expense;
            const netColor = net >= 0 ? 'var(--c-income)' : 'var(--c-expense)';
            const bankClass = id === 'kaspi' ? 'kaspi' : (id === 'halyk' ? 'halyk' : (id === 'tr_bank' ? 'tr' : ''));

            return `
                <div class="glass bank-report-card ${bankClass}">
                    <div class="bank-header">
                        <span style="color:${bankClass === 'kaspi' ? '#f22c2c' : (bankClass === 'halyk' ? '#00b159' : '#3b82f6')};">●</span>
                        ${b.name}
                    </div>
                    <div class="bank-stats">
                        <div class="stat-row">
                            <span class="stat-label">Giriş:</span>
                            <span class="stat-value" style="color:var(--c-income);">+${this.formatCurrency(b.income, b.currency)}</span>
                        </div>
                        <div class="stat-row">
                            <span class="stat-label">Çıkış:</span>
                            <span class="stat-value" style="color:var(--c-expense);">-${this.formatCurrency(b.expense, b.currency)}</span>
                        </div>
                    </div>
                    <div class="net-status" style="color:${netColor}">
                        ${net >= 0 ? '+' : ''}${this.formatCurrency(net, b.currency)}
                    </div>
                </div>`;
        }).join('');

        const monthOptions = [
            { v: 0, n: 'Tüm Yıl (Yıllık)' },
            { v: 1, n: 'Ocak' }, { v: 2, n: 'Şubat' }, { v: 3, n: 'Mart' },
            { v: 4, n: 'Nisan' }, { v: 5, n: 'Mayıs' }, { v: 6, n: 'Haziran' },
            { v: 7, n: 'Temmuz' }, { v: 8, n: 'Ağustos' }, { v: 9, n: 'Eylül' },
            { v: 10, n: 'Ekim' }, { v: 11, n: 'Kasım' }, { v: 12, n: 'Aralık' }
        ].map(m => `<option value="${m.v}" ${currentMonth === m.v ? 'selected' : ''}>${m.n}</option>`).join('');

        const monthName = currentMonth === 0 ? 'Yıllık Genel' : (document.querySelector(`option[value="${currentMonth}"]`)?.text || 'Ay');

        overlay.innerHTML = `
            <div class="card glass modal large" style="max-height: 95vh; overflow-y: auto; padding: 30px;">
                <button class="btn-icon" onclick="app.closeModal()" style="position: absolute; right: 20px; top: 20px; z-index: 100;"><i data-lucide="x"></i></button>
                
                <div class="header-section">
                    <div>
                        <h1 style="margin:0; font-size:1.6rem;">Banka Dağılım Raporu</h1>
                        <p style="margin:5px 0 0; font-size:0.85rem; color:var(--text-muted);">${monthName} ${currentYear} - Görünüm</p>
                    </div>
                    <div class="controls">
                        <select class="glass-select" onchange="app.openAnalyticsModal(${currentMonth}, this.value)">
                            <option value="2026" ${currentYear == 2026 ? 'selected' : ''}>2026</option>
                            <option value="2025" ${currentYear == 2025 ? 'selected' : ''}>2025</option>
                        </select>
                        <select class="glass-select" onchange="app.openAnalyticsModal(this.value, ${currentYear})">
                            ${monthOptions}
                        </select>
                    </div>
                </div>

                <div class="grand-totals">
                    <div class="glass total-card">
                        <div class="label">GENEL GELİR</div>
                        <div class="value" style="color:var(--c-income);">+${this.formatCurrency(totalIncomeKzt, 'KZT')}</div>
                    </div>
                    <div class="glass total-card">
                        <div class="label">GENEL GİDER</div>
                        <div class="value" style="color:var(--c-expense);">-${this.formatCurrency(totalExpenseKzt, 'KZT')}</div>
                    </div>
                </div>

                <div class="bank-grid">
                    ${bankCardsHtml || '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Bu dönemde herhangi bir banka hareketi bulunamadı.</div>'}
                </div>

                <div style="text-align:center; margin-top: 20px;">
                    <p style="color:var(--text-muted); font-size:0.8rem;">Bu rapor banka bazlı bir performans tablosudur. <br>Harcama kategorileri ve günlük trend detayları çıkarılmıştır.</p>
                </div>
            </div>`;
        overlay.classList.remove('hidden');
        lucide.createIcons();
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
        
        const filtered = Store.state.transactions.filter(tx => {
            const bank = Store.state.banks.find(b => b.id === tx.bankId);
            if (bank && bank.isHidden) return false;
            
            return tx.category.toLowerCase().includes(search) || 
                   (tx.note && tx.note.toLowerCase().includes(search));
        });

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
                                ${['Giderler', 'Açılış', 'Transfer', 'Özel Gider'].includes(cat) ? 
                                    '<span style="font-size: 0.7rem; opacity: 0.5;">Sistem</span>' : 
                                    `<button class="btn-icon" onclick="app.handleDeleteCategory('${cat}')"><i data-lucide="trash-2" style="width:14px; color: var(--c-danger)"></i></button>`
                                }
                            </div>
                        `).join('')}
                    </div>
                <section style="margin-top: 25px; background: rgba(99, 102, 241, 0.05); padding: 15px; border-radius: 15px; border: 1px dashed rgba(99, 102, 241, 0.3);">
                    <h3 style="font-size: 0.9rem; color: var(--primary); margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
                        <i data-lucide="smartphone" style="width: 16px;"></i> Kurulum Yardımcısı
                    </h3>
                    
                    <div id="pwaStatus">
                        ${this.deferredPrompt ? `
                            <p style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 15px;">Uygulamayı Android cihazınıza APK gibi yükleyebilirsiniz.</p>
                            <button class="btn-primary" onclick="app.handlePWAInstall()" style="width: 100%; justify-content: center; background: var(--primary);">
                                <i data-lucide="download"></i> Uygulamayı Şimdi Yükle
                            </button>
                        ` : `
                            <p style="font-size: 0.75rem; color: var(--text-muted);">
                                <b>iPhone Kullanıcıları:</b> Safari alt menüsündeki <i data-lucide="share" style="width:12px; vertical-align:middle;"></i> <b>Paylaş</b> butonuna basıp <b>"Ana Ekrana Ekle"</b> seçeneğini kullanarak uygulamayı yükleyebilir.
                            </p>
                        `}
                    </div>
                </section>
            </div>
        `;
        overlay.classList.remove('hidden');
        lucide.createIcons();
    },


    openSpecialBankModal() {
        const overlay = document.getElementById('modalOverlay');
        const hiddenBanks = Store.state.banks.filter(b => b.isHidden);
        const balances = Store.getBankBalances();
        
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const incomes = {};
        hiddenBanks.forEach(b => incomes[b.id] = 0);
        
        Store.state.transactions.forEach(tx => {
            const txDate = new Date(tx.date || Date.now());
            if (txDate >= startOfYear && tx.type === 'income' && incomes[tx.bankId] !== undefined) {
                incomes[tx.bankId] += parseFloat(tx.amount);
            }
        });

        const secretTxs = Store.state.transactions.filter(tx => 
            hiddenBanks.some(b => b.id === tx.bankId || b.id === tx.fromBankId)
        );
        
        const secretTxsHtml = secretTxs.length === 0 ? 
            '<div class="card glass empty-state" style="text-align:center; padding: 20px;">Henüz işlem bulunamadı.</div>' :
            secretTxs.map(tx => `
            <div class="card glass transaction-item animate-in" style="margin-bottom: 10px; border: 1px solid rgba(255,255,255,0.05); padding: 10px;">
                <div class="tx-icon ${tx.type}">
                    <i data-lucide="${tx.type === 'income' ? 'trending-up' : (tx.type === 'expense' ? 'trending-down' : 'repeat')}"></i>
                </div>
                <div class="tx-details">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <span class="tx-title">${tx.category}</span>
                        <div class="tx-amount ${tx.type}">
                            ${tx.type === 'expense' ? '-' : ''}${app.formatCurrency(tx.amount, tx.currency)}
                        </div>
                    </div>
                    <div class="tx-meta" style="margin-top: 5px; font-size: 0.85rem; color: var(--text-main); font-weight: 400;">
                        ${tx.note ? `<div class="tx-note" style="margin-bottom: 5px; background: rgba(255,255,255,0.03); padding: 5px 10px; border-radius: 8px;">${tx.note}</div>` : ''}
                        <span style="opacity: 0.6;">${new Date(tx.date).toLocaleDateString()} • ${Store.state.banks.find(b => b.id === tx.bankId)?.name || tx.bankId}</span>
                    </div>
                </div>
                <div class="tx-actions">
                    <button class="btn-icon" onclick="app.editTx(${tx.id})" title="Değiştir"><i data-lucide="edit-3" style="width:16px; color: var(--primary)"></i></button>
                    <button class="btn-icon" onclick="if(confirm('Silmek istediğinize emin misiniz?')) { Store.deleteTransaction(${tx.id}); app.openSpecialBankModal(); app.renderDashboard(); app.renderTransactions(); }" title="Sil"><i data-lucide="trash-2" style="width:16px; color: var(--c-danger)"></i></button>
                </div>
            </div>`).join('');

        const gridHtml = hiddenBanks.map(b => `
            <div class="bank-card glass animate-in" style="padding: 15px; position: relative; border-radius: 16px; border: 1px solid rgba(255,255,255,0.08);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px; cursor: pointer;" onclick="const n=prompt('Yeni isim:', '${b.name}'); if(n) app.updateSecretCardName('${b.id}', n)">
                        <i data-lucide="shield" class="kaspi-color" style="width: 18px; height: 18px;"></i>
                        <span style="font-size: 0.8rem; font-weight: 500; color: var(--text-muted); display: flex; align-items: center; gap: 4px;">
                            ${b.name} <i data-lucide="edit-2" style="width: 10px; opacity: 0.5;"></i>
                        </span>
                    </div>
                    <button class="btn-icon" onclick="app.handleDeleteSecretCard('${b.id}')" style="width: 24px; height: 24px; padding: 0; background: transparent;" title="Kartı Sil">
                        <i data-lucide="trash-2" style="width: 14px; color: var(--c-danger); opacity: 0.6;"></i>
                    </button>
                </div>
                
                <div style="font-size: 1.25rem; font-weight: 700; color: var(--text-main); margin-bottom: 5px;">
                    ${app.formatCurrency(balances[b.id] || 0, b.currency)}
                </div>
                
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                    <div style="font-size: 0.75rem; color: var(--c-usd);">
                        ${app.formatCurrency(incomes[b.id], b.currency)} (Yıllık Giriş)
                    </div>
                    <button class="btn-icon" onclick="app.viewBankStatement('${b.id}')" style="background: rgba(255,255,255,0.03); width: 28px; height: 28px;" title="Ekstre Görüntüle">
                        <i data-lucide="file-text" style="width:14px; color: var(--primary);"></i>
                    </button>
                </div>
            </div>`).join('');

        const selectOptions = hiddenBanks.map(b => `<option value="${b.id}">${b.name}</option>`).join('');

        overlay.innerHTML = `
            <div class="card glass modal large" style="max-height: 90vh; overflow-y: auto;">
                <div class="modal-header" style="position: sticky; top: 0; background: var(--bg-modal); z-index: 10; padding-bottom: 15px; margin-bottom: 20px; border-bottom: 1px solid var(--glass-border);">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <i data-lucide="shield" style="color: var(--primary);"></i>
                        <h2 style="color: var(--primary); font-size: 1.25rem;">Gizli Kart Yönetimi</h2>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <button class="btn-icon" onclick="app.handleAddNewSecretCard()" title="Yeni Kart Ekle" style="background: rgba(99, 102, 241, 0.1); border: 1px solid var(--primary); color: var(--primary); width: 32px; height: 32px;">
                            <i data-lucide="plus" style="width: 18px;"></i>
                        </button>
                        <button class="btn-icon" onclick="app.closeModal()"><i data-lucide="x"></i></button>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px; margin-bottom: 25px;">
                    ${gridHtml}
                </div>

                <div class="card glass" style="padding: 15px; background: rgba(99, 102, 241, 0.05); border: 1px dashed rgba(99, 102, 241, 0.3); border-radius: 16px;">
                    <h3 style="font-size: 0.9rem; color: var(--primary); margin-bottom: 10px;">Hızlı Para Girişi</h3>
                    <form onsubmit="app.handleSecretDeposit(event)" style="display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end;">
                        <div class="form-group" style="flex: 1; min-width: 140px; margin: 0;">
                            <label>Kart Seçin</label>
                            <select class="glass-input" id="secretBankTarget" style="padding: 5px 10px;">${selectOptions}</select>
                        </div>
                        <div class="form-group" style="flex: 1; min-width: 100px; margin: 0;">
                            <label>Tutar (KZT)</label>
                            <input type="number" step="0.01" class="glass-input" id="secretAmount" style="padding: 5px 10px;" required>
                        </div>
                        <button type="submit" class="btn-primary" style="height: 38px; padding: 0 15px;">Ekle</button>
                    </form>
                </div>

                <div style="margin-top: 25px;">
                    <h3 style="font-size: 1rem; color: var(--text-main); margin-bottom: 15px; border-bottom: 1px solid var(--glass-border); padding-bottom: 5px;">Gizli Kart Son İşlemleri</h3>
                    <div style="padding-right: 5px;">${secretTxsHtml}</div>
                </div>
            </div>
        `;
        overlay.classList.remove('hidden');
        lucide.createIcons();
    },

    updateSecretCardName(id, newName) {
        Store.updateBankName(id, newName);
        this.openSpecialBankModal(); // Refresh modal
    },

    handleSecretDeposit(event) {
        event.preventDefault();
        const bankId = document.getElementById('secretBankTarget').value;
        const amount = parseFloat(document.getElementById('secretAmount').value);

        if (amount > 0) {
             Store.addTransaction({
                type: 'income',
                amount: amount,
                currency: 'KZT',
                bankId: bankId,
                category: 'Açılış',
                note: 'Özel Kasa Açılış / Para Girişi',
                rateUsed: 1
            });
            this.openSpecialBankModal(); // Refresh modal
            this.renderDashboard();
            this.renderTransactions();
            this.renderExpenseStats();
        }
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

    async handlePWAInstall() {
        if (!this.deferredPrompt) return;
        this.deferredPrompt.prompt();
        const { outcome } = await this.deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
        this.deferredPrompt = null;
        this.openRatesModal(); // Refresh modal to hide button
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

                <div class="statement-controls" style="display: flex; flex-wrap: wrap; gap: 10px;">
                    <div class="date-range" style="display: flex; flex-wrap: wrap; gap: 5px; align-items: center; width: 100%;">
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
                                <th style="text-align:center; width: 60px;">Aksiyon</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filtered.length === 0 ? '<tr><td colspan="6" style="text-align:center; padding: 30px;">Bu dönemde işlem bulunamadı.</td></tr>' : 
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
                                    <td style="text-align:center; vertical-align: middle;">
                                        <div style="display: flex; gap: 5px; justify-content: center; align-items: center; height: 100%;">
                                            <button class="btn-icon" style="padding: 4px;" onclick="app.editTx(${tx.id})" title="Düzenle">
                                                <i data-lucide="edit-3" style="width:14px; color: var(--primary)"></i>
                                            </button>
                                            <button class="btn-icon" style="padding: 4px;" onclick="if(confirm('Silmek istediğinize emin misiniz?')) { Store.deleteTransaction(${tx.id}); app.viewBankStatement('${bankId}'); app.renderDashboard(); app.renderTransactions(); }" title="Sil">
                                                <i data-lucide="trash-2" style="width:14px; color: var(--c-danger)"></i>
                                            </button>
                                        </div>
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
,

    updateSecretCardName(id, name) {
        Store.updateBankName(id, name);
        this.openSpecialBankModal();
    },

    handleAddNewSecretCard() {
        const name = prompt('Yeni Kart İsmi:');
        if (name) {
            Store.addSecretBank(name);
            this.openSpecialBankModal();
        }
    },

    handleDeleteSecretCard(id) {
        if (confirm('Bu kartı (ve ayarlarını) silmek istediğinize emin misiniz?')) {
            Store.deleteBank(id);
            this.openSpecialBankModal();
        }
    }};

window.app = app;
document.addEventListener('DOMContentLoaded', () => app.init());
// Search listener
document.getElementById('searchInput').addEventListener('input', () => app.renderTransactions());
