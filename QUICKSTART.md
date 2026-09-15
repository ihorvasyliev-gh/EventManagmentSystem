# 🚀 Быстрый старт

## 1. Клонирование и установка

```bash
git clone https://github.com/ihorvasyliev-gh/CCPFlowCalendar.git
cd CCPFlowCalendar
npm install
```

## 2. Настройка переменных окружения

Создайте файл `.env.local` в корне проекта:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_CLOUDFLARE_R2_PUBLIC_URL=https://pub-xxxxx.r2.dev
```

**Где взять значения:**

### Supabase:
1. Зайдите на https://supabase.com
2. Создайте проект (или используйте существующий)
3. Settings → API → скопируйте:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_ANON_KEY`

### Cloudflare R2:
1. Зайдите в Cloudflare Dashboard → R2
2. Создайте bucket
3. Включите Public Access
4. Скопируйте публичный URL → `VITE_CLOUDFLARE_R2_PUBLIC_URL`

## 3. Настройка базы данных Supabase

1. Откройте файл **`supabase-setup.sql`** в проекте
2. В Supabase Dashboard → SQL Editor вставьте содержимое файла
3. Нажмите **Run**

📖 **Подробные инструкции:** См. файл `SUPABASE_SETUP.md`

## 4. Запуск

```bash
npm run dev
```

Откройте http://localhost:3000

## 5. Деплой на Cloudflare Pages

1. Запушьте код в GitHub:
```bash
git add .
git commit -m "Initial commit"
git push origin main
```

2. В Cloudflare Dashboard:
   - Pages → Create a project
   - Подключите GitHub репозиторий
   - Build command: `npm run build`
   - Build output: `dist`
   - Добавьте переменные окружения (те же, что в `.env.local`)

3. Готово! Приложение будет доступно по адресу `https://your-project.pages.dev`

Подробные инструкции: см. `DEPLOY.md`
