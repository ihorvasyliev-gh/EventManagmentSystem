# Инструкция по деплою CCP Event Calendar

## Подготовка к деплою

### 1. Настройка Supabase

#### Создание проекта
1. Перейдите на https://supabase.com и войдите в аккаунт
2. Нажмите "New Project"
3. Заполните:
   - **Name:** CCP Event Calendar
   - **Database Password:** (сохраните пароль!)
   - **Region:** выберите ближайший регион
4. Дождитесь создания проекта (2-3 минуты)

#### Настройка базы данных
1. В Supabase Dashboard перейдите в **SQL Editor**
2. Откройте файл **`supabase-setup.sql`** из проекта
3. Скопируйте весь содержимое и вставьте в SQL Editor
4. Нажмите **Run** для выполнения скрипта

📖 **Подробные инструкции:** См. файл `SUPABASE_SETUP.md`

```sql
-- Создание таблицы пользователей
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Создание таблицы событий
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  location TEXT,
  poster_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  category TEXT,
  tags TEXT[],
  rsvp_enabled BOOLEAN DEFAULT false,
  max_attendees INTEGER,
  creator_id UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Создание таблицы комментариев
CREATE TABLE IF NOT EXISTS event_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  user_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Создание таблицы истории изменений
CREATE TABLE IF NOT EXISTS event_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  user_name TEXT NOT NULL,
  action TEXT NOT NULL,
  changes JSONB,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Создание таблицы RSVP (для повторяющихся событий — отдельно на каждое вхождение)
CREATE TABLE IF NOT EXISTS rsvps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  occurrence_date TIMESTAMP WITH TIME ZONE NOT NULL,
  user_id UUID REFERENCES users(id),
  user_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'going',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(event_id, user_id, occurrence_date)
);

-- Создание индексов для производительности
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
CREATE INDEX IF NOT EXISTS idx_events_creator ON events(creator_id);
CREATE INDEX IF NOT EXISTS idx_comments_event ON event_comments(event_id);
CREATE INDEX IF NOT EXISTS idx_history_event ON event_history(event_id);
CREATE INDEX IF NOT EXISTS idx_rsvps_event ON rsvps(event_id);
CREATE INDEX IF NOT EXISTS idx_rsvps_event_occurrence ON rsvps(event_id, occurrence_date);
```

4. Настройте Row Level Security (RLS):
   - В таблице `events` включите RLS
   - Создайте политики доступа (примеры в `supabase-functions.sql`)

#### Получение ключей API
1. В Supabase Dashboard → **Settings** → **API**
2. Скопируйте:
   - **Project URL** (например: `https://xxxxx.supabase.co`)
   - **anon public** key (длинная строка)

### 2. Настройка Cloudflare R2

#### Создание bucket
1. Войдите в [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Перейдите в **R2** → **Create bucket**
3. Название: `ccp-event-posters` (или другое)
4. Нажмите **Create bucket**

#### Настройка публичного доступа
1. Откройте созданный bucket
2. Перейдите в **Settings** → **Public Access**
3. Включите **Allow Access**
4. Настройте **Custom Domain** (опционально):
   - Добавьте поддомен (например: `posters.yourdomain.com`)
   - Или используйте R2.dev domain (автоматически создается)
5. Скопируйте публичный URL:
   - Custom Domain: `https://posters.yourdomain.com`
   - Или R2.dev: `https://pub-xxxxx.r2.dev`

#### Создание API токена (для будущих backend функций)
1. R2 → **Manage R2 API Tokens**
2. **Create API Token**
3. Настройки:
   - **Token name:** `ccp-calendar-upload`
   - **Permissions:** Object Read & Write
   - **TTL:** по необходимости
4. Сохраните токен (понадобится для backend)

### 3. Подготовка GitHub репозитория

1. Убедитесь, что все изменения закоммичены:
```bash
git add .
git commit -m "Prepare for deployment"
```

2. Запушьте в GitHub:
```bash
git remote add origin https://github.com/ihorvasyliev-gh/CCPFlowCalendar.git
git branch -M main
git push -u origin main
```

## Деплой на Cloudflare Pages

### Вариант 1: Через веб-интерфейс (рекомендуется)

1. **Подключение репозитория:**
   - Перейдите в [Cloudflare Dashboard](https://dash.cloudflare.com)
   - **Pages** → **Create a project**
   - **Connect to Git** → выберите GitHub
   - Авторизуйтесь и выберите репозиторий `CCPFlowCalendar`
   - Нажмите **Begin setup**

2. **Настройки сборки:**
   - **Project name:** `ccp-event-calendar` (или другое)
   - **Production branch:** `main`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** `/` (оставьте пустым)

3. **Переменные окружения:**
   Нажмите **Add variable** и добавьте:
   ```
   VITE_SUPABASE_URL = https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY = your-anon-key-here
   VITE_CLOUDFLARE_R2_PUBLIC_URL = https://pub-xxxxx.r2.dev
   ```

4. **Деплой:**
   - Нажмите **Save and Deploy**
   - Дождитесь завершения сборки (2-5 минут)
   - После успешного деплоя вы получите URL: `https://ccp-event-calendar.pages.dev`

5. **Настройка кастомного домена (опционально):**
   - В настройках проекта → **Custom domains**
   - Добавьте ваш домен
   - Следуйте инструкциям по настройке DNS

### Вариант 2: Через Wrangler CLI

1. **Установка Wrangler:**
```bash
npm install -g wrangler
```

2. **Авторизация:**
```bash
wrangler login
```

3. **Сборка проекта:**
```bash
npm install
npm run build
```

4. **Деплой:**
```bash
wrangler pages deploy dist \
  --project-name=ccp-event-calendar \
  --compatibility-date=2024-01-01
```

5. **Добавление переменных окружения:**
```bash
wrangler pages secret put VITE_SUPABASE_URL
# Введите значение при запросе

wrangler pages secret put VITE_SUPABASE_ANON_KEY
wrangler pages secret put VITE_CLOUDFLARE_R2_PUBLIC_URL
```

## Проверка после деплоя

1. Откройте URL вашего приложения
2. Проверьте консоль браузера (F12) на наличие ошибок
3. Попробуйте войти в систему
4. Создайте тестовое событие
5. Проверьте загрузку постеров в R2

## Обновление приложения

После каждого изменения в коде:

1. Закоммитьте и запушьте изменения:
```bash
git add .
git commit -m "Your changes"
git push origin main
```

2. Cloudflare Pages автоматически задеплоит новую версию
3. Или вручную в Dashboard → **Retry deployment**

## Troubleshooting

### Ошибки сборки
- Проверьте, что все зависимости установлены (`npm install`)
- Убедитесь, что Node.js версия 18+
- Проверьте логи сборки в Cloudflare Dashboard

### Ошибки переменных окружения
- Убедитесь, что все переменные добавлены в Cloudflare Pages
- Проверьте, что переменные начинаются с `VITE_` (для Vite)
- После изменения переменных пересоберите проект

### Ошибки подключения к Supabase
- Проверьте правильность URL и ключа
- Убедитесь, что RLS политики настроены корректно
- Проверьте CORS настройки в Supabase

### Проблемы с R2
- Убедитесь, что bucket имеет публичный доступ
- Проверьте правильность публичного URL
- Убедитесь, что файлы загружаются с правильными заголовками

## Полезные ссылки

- [Supabase Documentation](https://supabase.com/docs)
- [Cloudflare Pages Documentation](https://developers.cloudflare.com/pages/)
- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- [Vite Documentation](https://vitejs.dev/)
