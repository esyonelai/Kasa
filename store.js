const Store = {
    // Initial State
    state: {
        transactions: [],
        rates: {
            usdKzt: 450, 
            usdTry: 32.5
        },
        banks: [
            { id: 'kaspi', name: 'Kaspi Bank', currency: 'KZT', balance: 0 },
            { id: 'halyk', name: 'Halyk Bank', currency: 'KZT', balance: 0 },
            { id: 'tr_bank', name: 'TR Bank', currency: 'TRY', balance: 0 }
        ],
        expenseCenters: [
            'Giderler', 'Açılış', 'Transfer', 'Özel Gider'
        ]
    },

    init() {
        const savedData = localStorage.getItem('kasa_data');
        if (savedData) {
            const data = JSON.parse(savedData);
            
            // Ensure expenseCenters exist and are not empty
            if (!data.expenseCenters || data.expenseCenters.length === 0) {
                data.expenseCenters = ['Giderler', 'Açılış', 'Transfer', 'Özel Gider'];
            }
            
            // Ensure default categories are always there
            const defaults = ['Giderler', 'Açılış', 'Transfer', 'Özel Gider'];
            defaults.forEach(def => {
                if (!data.expenseCenters.includes(def)) data.expenseCenters.push(def);
            });

            // Ensure rates exist
            data.rates = { ...this.state.rates, ...(data.rates || {}) };
            this.state = data;
        } else {
            // Check for individual rates if first time
            const savedRates = localStorage.getItem('kasa_rates');
            if (savedRates) this.state.rates = { ...this.state.rates, ...JSON.parse(savedRates) };
        }
    },

    addExpenseCenter(name) {
        if (!name || this.state.expenseCenters.includes(name)) return;
        this.state.expenseCenters.push(name);
        this.save();
    },

    deleteExpenseCenter(name) {
        // Don't allow deleting defaults
        const defaults = ['Giderler', 'Açılış', 'Transfer', 'Özel Gider'];
        if (defaults.includes(name)) return;
        
        this.state.expenseCenters = this.state.expenseCenters.filter(c => c !== name);
        this.save();
    },

    // Central Conversion Engine
    convert(amount, from, to) {
        if (from === to) return amount;
        const rt = this.state.rates;
        
        // Convert to USD first (Pivot)
        let amountInUsd = amount;
        if (from === 'KZT') amountInUsd = amount / rt.usdKzt;
        else if (from === 'TRY') amountInUsd = amount / rt.usdTry;
        else if (from === 'USD') amountInUsd = amount;

        // Convert from USD to target
        if (to === 'KZT') return amountInUsd * rt.usdKzt;
        if (to === 'TRY') return amountInUsd * rt.usdTry;
        if (to === 'USD') return amountInUsd;
        
        return amount;
    },

    save() {
        localStorage.setItem('kasa_data', JSON.stringify(this.state));
    },

    saveRates(rates) {
        this.state.rates = rates;
        localStorage.setItem('kasa_rates', JSON.stringify(rates));
        this.save();
    },

    addTransaction(tx) {
        const timestamp = Date.now();
        const transferGroupId = tx.transferGroupId || timestamp;
        
        // 1. Ana İşlem(ler)i Oluştur
        if (tx.type === 'transfer' && tx.toBankId) {
            const rt = this.state.rates;
            const fromBank = this.state.banks.find(b => b.id === tx.bankId);
            const toBank = this.state.banks.find(b => b.id === tx.toBankId);

            const withdrawal = {
                id: timestamp,
                date: tx.date || new Date().toISOString(),
                type: 'expense',
                amount: tx.amount,
                currency: tx.currency,
                bankId: tx.bankId,
                toBankId: tx.toBankId,
                category: 'Transfer',
                note: tx.note || `Transfer -> ${toBank.name}`,
                rateUsed: tx.rateUsed,
                transferGroupId
            };

            let targetAmount = this.convert(parseFloat(tx.amount), tx.currency, toBank.currency);

            const deposit = {
                id: timestamp + 1,
                date: tx.date || new Date().toISOString(),
                type: 'income',
                amount: targetAmount,
                currency: toBank.currency,
                bankId: tx.toBankId,
                fromBankId: tx.bankId,
                category: 'Transfer',
                note: tx.note || `Transfer <- ${fromBank.name}`,
                rateUsed: 1,
                transferGroupId
            };

            this.state.transactions.unshift(withdrawal, deposit);
        } else {
            tx.id = timestamp;
            tx.date = tx.date || new Date().toISOString();
            tx.transferGroupId = transferGroupId;
            this.state.transactions.unshift(tx);
        }

        // 2. Komisyon Kaydı (Varsa)
        if (tx.commissionAmount > 0) {
            const commissionTx = {
                id: timestamp + 2,
                date: tx.date || new Date().toISOString(),
                type: 'expense',
                amount: tx.commissionAmount,
                currency: tx.commissionCurrency || 'KZT',
                bankId: tx.bankId,
                category: 'Giderler',
                note: `Komisyon: ${tx.category || 'İşlem'}`,
                transferGroupId
            };
            this.state.transactions.unshift(commissionTx);
        }

        this.save();
    },

    getBankBalances() {
        const balances = { kaspi: 0, halyk: 0, tr_bank: 0 };
        const rt = this.state.rates;

        this.state.transactions.forEach(tx => {
            const amount = parseFloat(tx.amount);
            const bank = this.state.banks.find(b => b.id === tx.bankId);
            if (!bank) return;

            const finalAmount = this.convert(amount, tx.currency, bank.currency);

            if (tx.type === 'income') balances[tx.bankId] += finalAmount;
            else if (tx.type === 'expense') balances[tx.bankId] -= finalAmount;
        });

        return balances;
    },

    getTotalInKzt() {
        const balances = this.getBankBalances();
        // Sadece Kaspi ve Halyk toplamını göster
        return (balances.kaspi || 0) + (balances.halyk || 0);
    },

    getPendingAdvancesTotal() {
        const rt = this.state.rates;
        let total = 0;
        this.state.transactions.forEach(tx => {
            if (tx.isAdvance && tx.advanceStatus === 'pending') {
                total += this.convert(parseFloat(tx.amount), tx.currency, 'KZT');
            }
        });
        return total;
    },

    getPendingDebtsTotal() {
        let total = 0;
        this.state.transactions.forEach(tx => {
            if (tx.isDebt && tx.debtStatus === 'pending') {
                total += this.convert(parseFloat(tx.amount), tx.currency, 'KZT');
            }
        });
        return total;
    },

    getContactSummaries() {
        const summaries = {};
        
        // Sadece isim belirtilmiş işlemleri tara
        this.state.transactions.forEach(tx => {
            if (!tx.contact) return;
            
            if (!summaries[tx.contact]) {
                summaries[tx.contact] = { balance: 0, pendingCount: 0 };
            }

            const amountKzt = this.convert(parseFloat(tx.amount), tx.currency, 'KZT');
            
            // Kullanıcı için Borç da Avans da "Alacak" hükmünde (Giden para)
            // Giden paralar + , Geri gelen paralar -
            if (tx.type === 'expense') {
                summaries[tx.contact].balance += amountKzt;
                if (tx.isAdvance || tx.isDebt) {
                    if (tx.advanceStatus === 'pending' || tx.debtStatus === 'pending') {
                        summaries[tx.contact].pendingCount++;
                    }
                }
            } else if (tx.type === 'income') {
                summaries[tx.contact].balance -= amountKzt;
            }
        });
        
        return summaries;
    },

    getCurrencyTotals() {
        const totals = { KZT: 0, USD: 0, TRY: 0 };
        this.state.transactions.forEach(tx => {
            const amount = parseFloat(tx.amount);
            if (!totals[tx.currency]) totals[tx.currency] = 0;
            if (tx.type === 'income') totals[tx.currency] += amount;
            else if (tx.type === 'expense') totals[tx.currency] -= amount;
        });
        return totals;
    },

    updateTransaction(updatedTx) {
        // Eğer bir transfer grubuna aitse, tüm grubu etkileyebilir (basitlik için sadece tekil güncelleme)
        const index = this.state.transactions.findIndex(t => t.id === updatedTx.id);
        if (index !== -1) {
            this.state.transactions[index] = { ...this.state.transactions[index], ...updatedTx };
            this.save();
        }
    },

    deleteTransaction(id) {
        const tx = this.state.transactions.find(t => t.id === id);
        if (tx && tx.transferGroupId) {
            // Transfer ise her iki tarafı da sil
            this.state.transactions = this.state.transactions.filter(t => t.transferGroupId !== tx.transferGroupId);
        } else {
            this.state.transactions = this.state.transactions.filter(t => t.id !== id);
        }
        this.save();
    },

    returnAdvance(txId, targetBankId) {
        const index = this.state.transactions.findIndex(t => t.id === txId);
        if (index === -1) return;

        const original = this.state.transactions[index];
        original.advanceStatus = 'returned';

        // İade işlemi oluştur
        const refundTx = {
            id: Date.now(),
            date: new Date().toISOString(),
            type: 'income',
            amount: original.amount,
            currency: original.currency,
            bankId: targetBankId,
            category: 'Avans İadesi',
            note: `İade: ${original.note || original.category}`,
            isAdvance: true,
            advanceStatus: 'closed' // Bu bir iade kaydı
        };

        this.state.transactions.unshift(refundTx);
        this.save();
    },

    payDebt(txId, targetBankId) {
        const index = this.state.transactions.findIndex(t => t.id === txId);
        if (index === -1) return;

        const original = this.state.transactions[index];
        original.debtStatus = 'returned'; // 'paid' yerine 'returned' (Geri alındı)

        // Borç iadesi işlemi oluştur (Income)
        const refundTx = {
            id: Date.now(),
            date: new Date().toISOString(),
            type: 'income',
            amount: original.amount,
            currency: original.currency,
            bankId: targetBankId,
            category: 'Borç İadesi',
            contact: original.contact,
            note: `İade: ${original.note || original.category}`,
            isDebt: true,
            debtStatus: 'closed'
        };

        this.state.transactions.unshift(refundTx);
        this.save();
    }
};

Store.init();
window.Store = Store;
