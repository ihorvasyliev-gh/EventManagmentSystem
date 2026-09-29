# 🗄️ Настройка Supabase для CCP Event Calendar

Этот файл содержит пошаговые инструкции по настройке базы данных Supabase для проекта календаря событий.

## 📋 Содержание

1. [Создание проекта Supabase](#1-создание-проекта-supabase)
2. [Выполнение SQL скрипта](#2-выполнение-sql-скрипта)
3. [Настройка аутентификации](#3-настройка-аутентификации)
4. [Получение ключей API](#4-получение-ключей-api)
5. [Проверка настройки](#5-проверка-настройки)
6. [Создание тестовых пользователей](#6-создание-тестовых-пользователей)

---

## 1. Создание проекта Supabase

1. Перейдите на [https://supabase.com](https://supabase.com)
2. Войдите в свой аккаунт (или создайте новый)
3. Нажмите **"New Project"**
4. Заполните форму:
   - **Name:** `CCP Event Calendar` (или любое другое имя)
   - **Database Password:** Придумайте надежный пароль и **сохраните его!**
   - **Region:** Выберите ближайший регион (например, `West Europe` для Ирландии)
   - **Pricing Plan:** Выберите подходящий план (Free tier подходит для начала)
5. Нажмите **"Create new project"**
6. Дождитесь создания проекта (обычно 2-3 минуты)

---

## 2. Выполнение SQL скрипта

После создания проекта:

1. В Supabase Dashboard перейдите в **SQL Editor** (в левом меню)
2. Нажмите **"New query"**
3. Откройте файл `supabase-setup.sql` из этого проекта
4. Скопируйте **весь** содержимое файла
5. Вставьте в SQL Editor в Supabase
6. Нажмите **"Run"** (или `Ctrl+Enter` / `Cmd+Enter`)

✅ Если все прошло успешно, вы увидите сообщение "Success. No rows returned"

### Что создается:

- ✅ Таблицы: `users`, `events`, `event_attachments`, `event_comments`, `event_history`, `rsvps`
- ✅ Индексы для оптимизации запросов
- ✅ Триггеры для автоматического обновления `updated_at`
- ✅ Row Level Security (RLS) политики для безопасности
- ✅ Функции для удобной работы с данными
- ✅ Автоматическая синхронизация с `auth.users`

---

## 3. Настройка аутентификации

1. В Supabase Dashboard перейдите в **Authentication** → **Settings**
2. Настройте **Email Auth:**
   - ⚠️ **Отключите публичную регистрацию:** **Allow new users to sign up** → OFF.
     Формы регистрации в приложении нет, а anon key публичный (он в JS-бандле) — с включённой
     регистрацией любой человек из интернета может создать себе аккаунт через API.
     Сотрудников добавляйте через **Authentication** → **Users** → **Add user** (см. `CREATE_ADMIN_USER.md`) —
     это работает и при выключенной регистрации.
   - ⚠️ **КРИТИЧЕСКИ ВАЖНО: Отключите подтверждение email:**
     - Найдите опцию **"Confirm email"** 
     - **ОБЯЗАТЕЛЬНО отключите** её (переключите в положение OFF)
     - Это позволит пользователям регистрироваться и сразу входить без подтверждения почты
     - Без этого пользователи не смогут войти после регистрации до подтверждения email
   - Настройте **Email Templates** (опционально)
   - Настройте **SMTP Settings** для отправки писем (опционально)

3. **URL Configuration:**
   - **Site URL:** Укажите URL вашего приложения (например, `https://your-app.pages.dev`)
   - **Redirect URLs:** Добавьте URL для редиректа после входа

4. **OAuth Providers** (опционально):
   - Можно настроить Google, GitHub и другие провайдеры
   - Следуйте инструкциям в документации Supabase

> 💡 **Примечание:** Если вы хотите, чтобы пользователи подтверждали email, оставьте "Confirm email" включенным. В этом случае после регистрации пользователь получит письмо с подтверждением и сможет войти только после подтверждения.

---

## 4. Получение ключей API

1. В Supabase Dashboard перейдите в **Settings** → **API**
2. Найдите секцию **Project API keys**
3. Скопируйте следующие значения:

   - **Project URL** 
     ```
     https://xxxxx.supabase.co
     ```
     → Используйте как `VITE_SUPABASE_URL`

   - **anon public** key (длинная строка)
     ```
     eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
     ```
     → Используйте как `VITE_SUPABASE_ANON_KEY`

⚠️ **Важно:** 
- `anon` key - публичный ключ, безопасно использовать во frontend
- `service_role` key - секретный ключ, **НИКОГДА** не используйте во frontend!

---

## 5. Проверка настройки

### Проверка таблиц

1. Перейдите в **Table Editor** в Supabase Dashboard
2. Убедитесь, что видны все таблицы:
   - `users`
   - `events`
   - `event_attachments`
   - `event_comments`
   - `event_history`
   - `rsvps`

### Проверка RLS политик

1. Откройте любую таблицу в **Table Editor**
2. Нажмите на вкладку **Policies**
3. Убедитесь, что политики созданы и активны

### Тестовый запрос

В **SQL Editor** выполните:

```sql
-- Проверка структуры таблицы events
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'events'
ORDER BY ordinal_position;
```

Должны увидеть все колонки таблицы `events`.

---

## 6. Создание тестовых пользователей

### Вариант 1: Через Supabase Dashboard

1. Перейдите в **Authentication** → **Users**
2. Нажмите **"Add user"** → **"Create new user"**
3. Заполните:
   - **Email:** `admin@ccp.com`
   - **Password:** (придумайте пароль)
   - **Auto Confirm User:** ✅ Включите (если подтверждение email отключено, пользователь будет подтвержден автоматически)
4. Нажмите **"Create user"**

5. После создания пользователя, обновите его роль в таблице `users`:
   ```sql
   UPDATE public.users
   SET role = 'admin', full_name = 'CCP Administrator'
   WHERE email = 'admin@ccp.com';
   ```

6. Повторите для сотрудника:
   - Email: `staff@ccp.com`
   - Role: `staff`

> 💡 **Примечание:** Если подтверждение email отключено (см. раздел 3), пользователи могут регистрироваться через форму регистрации в приложении без необходимости подтверждения почты.

### Вариант 2: Через SQL (только для тестирования)

⚠️ **Внимание:** Этот метод создает пользователя без пароля. Используйте только для тестирования!

```sql
-- Создание тестового пользователя через SQL
-- НЕ рекомендуется для продакшена!

-- Сначала создайте пользователя в auth.users
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'admin@ccp.com',
  crypt('your-password-here', gen_salt('bf')),
  NOW(),
  NOW(),
  NOW()
)
RETURNING id;

-- Затем обновите public.users (триггер должен создать запись автоматически)
-- Если не создалась, выполните:
INSERT INTO public.users (id, email, full_name, role)
SELECT id, email, 'CCP Administrator', 'admin'
FROM auth.users
WHERE email = 'admin@ccp.com'
ON CONFLICT (id) DO UPDATE
SET role = 'admin', full_name = 'CCP Administrator';
```

---

## 🔧 Дополнительные настройки

### Настройка Storage (опционально)

Если вы хотите использовать Supabase Storage вместо Cloudflare R2:

1. Перейдите в **Storage** в Supabase Dashboard
2. Создайте bucket `event-posters`
3. Настройте публичный доступ
4. Обновите код для использования Supabase Storage API

### Настройка Edge Functions (для R2 upload)

Если вы используете Cloudflare R2, вам может понадобиться Supabase Edge Function для получения presigned URLs:

1. Установите Supabase CLI: `npm install -g supabase`
2. Инициализируйте проект: `supabase init`
3. Создайте функцию: `supabase functions new r2-upload`
4. Следуйте документации Supabase для настройки

---

## ✅ Чеклист настройки

- [ ] Проект Supabase создан
- [ ] SQL скрипт `supabase-setup.sql` выполнен успешно
- [ ] Все таблицы созданы и видны в Table Editor
- [ ] RLS политики активны
- [ ] Выполнены миграции: `submission-migration.sql`, `recurrence-exceptions-migration.sql`, `realtime-events-migration.sql`, `custom-dates-migration.sql`, `add-custom-end-dates-migration.sql`, `rsvp-occurrence-migration.sql`, `event-comments-occurrence-migration.sql`
- [ ] **Выполнен `security-hardening-migration.sql`** (последним)
- [ ] **Публичная регистрация отключена** (Authentication → Sign In / Providers → Allow new users to sign up: OFF)
- [ ] Получены Project URL и anon key
- [ ] Настроена аутентификация
- [ ] **Подтверждение email отключено** (Authentication → Settings → Email Auth → Confirm email: OFF)
- [ ] Созданы тестовые пользователи
- [ ] Переменные окружения добавлены в `.env.local`
- [ ] Приложение подключено к Supabase

---

## 🆘 Troubleshooting

### Ошибка при выполнении SQL

- Убедитесь, что скопировали весь скрипт
- Проверьте, что проект полностью создан (не в процессе создания)
- Попробуйте выполнить скрипт по частям

### Пользователи не создаются автоматически

- Проверьте, что триггер `on_auth_user_created` создан
- Убедитесь, что функция `handle_new_user()` существует
- Проверьте логи в Supabase Dashboard → Logs

### RLS блокирует запросы

- Убедитесь, что пользователь авторизован
- Проверьте политики в Table Editor → Policies
- Временно отключите RLS для тестирования (не для продакшена!):
  ```sql
  ALTER TABLE public.events DISABLE ROW LEVEL SECURITY;
  ```

### Не могу подключиться из приложения

- Проверьте правильность URL и ключа
- Убедитесь, что переменные окружения начинаются с `VITE_`
- Проверьте CORS настройки (должны быть настроены автоматически)

---

## 📚 Полезные ссылки

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Auth Guide](https://supabase.com/docs/guides/auth)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/introduction)

---

## 🎉 Готово!

После выполнения всех шагов ваша база данных Supabase готова к использованию. Теперь вы можете:

1. Обновить код приложения для работы с Supabase
2. Установить `@supabase/supabase-js`: `npm install @supabase/supabase-js`
3. Создать клиент Supabase в вашем приложении
4. Заменить моки на реальные запросы к базе данных

Удачи! 🚀
