# 🗄️ Настройка Supabase для CCP Event Calendar

Пошаговая настройка базы данных и входа. Деплой сайта — в [`DEPLOY.md`](DEPLOY.md).

## 📋 Содержание

1. [Создание проекта](#1-создание-проекта)
2. [Схема базы данных](#2-схема-базы-данных)
3. [Аутентификация](#3-аутентификация)
4. [Первый администратор](#4-первый-администратор)
5. [Ключи API](#5-ключи-api)
6. [Проверка](#6-проверка)

---

## 1. Создание проекта

1. [https://supabase.com](https://supabase.com) → **New Project**.
2. **Name:** `CCP Event Calendar`, **Database Password:** надёжный (сохраните), **Region:** `West Europe` (ближе к Ирландии).
3. Дождитесь создания (2–3 минуты).

---

## 2. Схема базы данных

### Новый проект

1. **SQL Editor** → **New query**.
2. Вставьте **весь** файл [`supabase/setup.sql`](supabase/setup.sql) и нажмите **Run**.
3. Ожидаемый результат: «Success. No rows returned».

Скрипт можно запускать повторно — он ничего не ломает. Миграции из `supabase/migrations/` для нового проекта **не нужны**:
`setup.sql` уже содержит их итог.

### Существующий проект (обновление)

Выполните по порядку те файлы из [`supabase/migrations/`](supabase/migrations/), которые ещё не запускали:

| Файл | Что делает |
|---|---|
| `001`–`010` | повторяющиеся события, свои даты/места, заявки сотрудников, Realtime, категории |
| `011_security_hardening.sql` | роли только через админа, закрытые политики |
| `012_access_accounts_and_cleanup.sql` | закрывает анониму доступ к таблицам, флаг смены пароля, журнал ошибок, убирает комментарии и RSVP |

> ⚠️ **012 — только после деплоя новой версии сайта** (см. «Порядок релиза» в `DEPLOY.md`).
> Старая версия сайта читает таблицы напрямую под anon key и после 012 перестанет работать.

Миграции `011` и `012` можно запускать повторно; старые `001`–`010` — по одному разу.

### Что получается

- **Таблицы:** `users`, `events`, `event_attachments`, `event_history`, `event_categories`,
  `recurrence_exceptions`, `client_errors`.
- **Триггеры:** `updated_at`; запись в историю при создании события; создание строки в `users`
  для каждого нового входа (всегда с ролью `staff`); запрет менять роль кому-либо, кроме админа.
- **Доступ (RLS):**
  - анониму таблицы недоступны вовсе — форма `/submit` и календарные ленты работают через Pages Functions
    с service role key;
  - сотрудник видит опубликованные события, создаёт черновики и правит только свою строку в `users` (кроме роли);
  - админ видит и меняет всё;
  - `client_errors` пишет только сервер (функция `log_client_error`), хранятся 90 дней, не больше 5000 строк.
- **Realtime:** таблица `events` в публикации `supabase_realtime` — изменения приходят в открытые вкладки сразу.

---

## 3. Аутентификация

**Authentication → Sign In / Providers:**

- ⚠️ **Allow new users to sign up → OFF.** Формы регистрации в приложении нет, а anon key публичный
  (он в JS-бандле): с включённой регистрацией кто угодно может создать себе аккаунт через API.
  Аккаунты создаёт админ в приложении (**Staff accounts**) — это работает и при выключенной регистрации.
- **Confirm email** — не важно: аккаунты из приложения и из Dashboard (с галочкой **Auto Confirm User**)
  создаются уже подтверждёнными.

**Authentication → URL Configuration:**

- **Site URL:** адрес сайта, например `https://ccp-event-calendar.pages.dev`.

Восстановления пароля по почте нет: если сотрудник забыл пароль, админ в **Staff accounts** нажимает
**Reset password**, получает временный пароль и передаёт его. При следующем входе приложение попросит
придумать новый пароль. Подробнее — в `README.md`, раздел «Roles».

---

## 4. Первый администратор

1. **Authentication → Users → Add user → Create new user.**
2. Email и пароль, галочка **Auto Confirm User** включена → **Create user**.
3. **SQL Editor:**
   ```sql
   UPDATE public.users
   SET role = 'admin', full_name = 'Ihor Vasyliev'
   WHERE email = 'admin@example.com';
   ```
   (из SQL Editor роль менять можно; из приложения — только админу.)

Остальных сотрудников админ добавляет в приложении: меню аккаунта → **Staff accounts** → **Add**.
Новый аккаунт всегда `staff` и при первом входе просит сменить временный пароль.
Сделать сотрудника админом — тот же `UPDATE` в SQL Editor.

---

## 5. Ключи API

**Settings → API:**

| Значение | Куда |
|---|---|
| **Project URL** (`https://xxxxx.supabase.co`) | `VITE_SUPABASE_URL` — в `.env.local` и в Cloudflare |
| **anon public** key | `VITE_SUPABASE_ANON_KEY` — в `.env.local` и в Cloudflare |
| **service_role** key | `SUPABASE_SERVICE_ROLE_KEY` — **только** секретом в Cloudflare |

⚠️ `service_role` обходит все правила доступа. Никогда не кладите его в `.env.local`, в код или в переменные `VITE_*`.

---

## 6. Проверка

**Table Editor:** видны таблицы из раздела 2, у каждой на вкладке **Policies** есть политики, RLS включён.

**SQL Editor:**

```sql
-- Колонки событий
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'events' ORDER BY ordinal_position;

-- Политики: у anon не должно быть ни одной
SELECT tablename, policyname, roles FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename;

-- Роли пользователей
SELECT email, role, must_change_password FROM public.users ORDER BY role, email;
```

---

## ✅ Чеклист

- [ ] Проект создан
- [ ] `supabase/setup.sql` выполнен (новый проект) **или** все миграции по `012` включительно (обновление, 012 — после деплоя)
- [ ] **Allow new users to sign up: OFF**
- [ ] Site URL указан
- [ ] Первый администратор создан, роль `admin`
- [ ] `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY` — в `.env.local` и в Cloudflare
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — секретом в Cloudflare

---

## 🆘 Troubleshooting

### Ошибка при выполнении SQL
- Скопирован не весь файл, или проект ещё создаётся. `setup.sql` можно запустить ещё раз.

### Пользователь вошёл, но событий нет / «permission denied»
- Нет строки в `public.users`. Проверьте, что триггер `on_auth_user_created` существует, и создайте строку вручную:
  ```sql
  INSERT INTO public.users (id, email, full_name, role)
  SELECT id, email, email, 'staff' FROM auth.users WHERE email = 'person@example.com'
  ON CONFLICT (id) DO NOTHING;
  ```

### Форма `/submit` или одобрение заявок отвечают ошибкой
- В Cloudflare нет `SUPABASE_SERVICE_ROLE_KEY` (см. `CLOUDFLARE_SETUP.md`).

### Изменения не приходят в открытые вкладки
- `events` не в публикации Realtime: **Database → Publications → supabase_realtime** → включите `events`.
- Или задайте `VITE_SUPABASE_REALTIME=false` — приложение будет обновлять события раз в минуту.

### Старые таблицы `event_comments` и `rsvps`
- После 012 ими никто не пользуется. Удалить — раскомментировать строки `DROP TABLE` в конце файла 012 и выполнить их.

---

## 📚 Полезные ссылки

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
