# MCP Supabase Server - Setup Instructions

## ✅ Co zostało już przygotowane:

- ✅ `.env` - plik konfiguracji (z placeholderami)
- ✅ `.env.example` - przykład zmiennych środowiskowych
- ✅ `.gitignore` - zabezpieczenie przed przypadkowym commitowaniem wrażliwych danych
- ✅ `config.json` - konfiguracja serwera MCP
- ✅ `config.example.json` - przykład konfiguracji

---

## 🔑 Krok 1: Wstaw swoje klucze API

### Przejdź do Supabase Dashboard:
1. Zaloguj się na [supabase.com](https://supabase.com)
2. Otwórz swój projekt
3. Przejdź do **Settings → API**

### Skopiuj klucze i wstaw je do `.env`:

```env
SUPABASE_URL=https://bnsfdjhpquvvpklqcibf.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuc2ZkamhwcXV2dnBrbHFjaWJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNzY5NTksImV4cCI6MjEwMTk1Mjk1OX0.bB3yTulT9d6JK3rR_Rfg9BySJQS0iVK8A1u5cebXtSo
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuc2ZkamhwcXV2dnBrbHFjaWJmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjM3Njk1OSwiZXhwIjoyMTAxOTUyOTU5fQ.opsI8E-e08DbZGd3wqx19svX_w22MivGgeAr7Y8h2t4
PORT=3000
LOG_LEVEL=info
```

> **⚠️ Ważne:** Nigdy nie commituj `.env` do repozytorium!

---

## 📦 Krok 2: Zainstaluj zależności

```bash
npm install
```

---

## 🚀 Krok 3: Uruchom serwer

### Tryb deweloperski:
```bash
npm run dev
```

### Tryb produkcji:
```bash
npm start
```

### Z custom konfiguracją:
```bash
npm start -- --config path/to/config.json
```

Serwer uruchomi się na porcie 3000 (lub innym zdefiniowanym w `.env`).

---

## 🔗 Krok 4: Połącz z Claude Code

Otwórz plik konfiguracyjny Claude Code (zazwyczaj `~/.claude/config.json`) i dodaj:

```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-supabase"],
      "env": {
        "SUPABASE_URL": "https://bnsfdjhpquvvpklqcibf.supabase.co",
        "SUPABASE_ANON_KEY": "YOUR_ANON_KEY_HERE",
        "SUPABASE_SERVICE_ROLE_KEY": "YOUR_SERVICE_ROLE_KEY_HERE"
      }
    }
  }
}
```

Restart IDE, aby zastosować zmiany.

---

## 🧪 Krok 5: Testuj funkcjonalność

Po uruchomieniu serwera możesz testować różne operacje:

- **Listy tabel**: `list_tables()`
- **Zapytania**: `query(sql="SELECT * FROM users")`
- **Insert**: `insert(table="users", records=[...])`
- **Update**: `update(table="users", updates={...}, where={...})`
- **Delete**: `delete(table="users", where={...})`

---

## 📚 Więcej informacji

Pełna dokumentacja API znajduje się w `README.md` na branchu.

---

## 🔒 Bezpieczeństwo

### Pamiętaj:
- ✅ Nigdy nie commituj `.env`
- ✅ Regeneruj klucze, jeśli przypadkiem je ujawnisz
- ✅ Używaj `SUPABASE_ANON_KEY` dla danych publicznych
- ✅ Używaj `SUPABASE_SERVICE_ROLE_KEY` ostrożnie (pełny dostęp)
- ✅ Skonfiguruj RLS (Row Level Security) w Supabase

---

## ❓ Rozwiązywanie problemów

### Błąd: `CONNECTION_ERROR`
- Sprawdź `SUPABASE_URL`
- Sprawdź połączenie z internetem
- Upewnij się, że projekt Supabase jest aktywny

### Błąd: `AUTH_ERROR`
- Sprawdź poprawność `SUPABASE_ANON_KEY` i `SUPABASE_SERVICE_ROLE_KEY`
- Regeneruj klucze w Supabase Dashboard

### Błąd: `PERMISSION_DENIED`
- Sprawdź RLS policies
- Upewnij się, że policy pozwala na operację

---

**Gotowe! 🎉 Teraz możesz zacząć pracować z Supabase przez MCP.**
