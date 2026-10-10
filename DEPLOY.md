# Инструкция по деплою CCP Event Calendar

Приложение — статический сайт (Vite) плюс Pages Functions в `functions/api/` на Cloudflare Pages.
Данные и вход — Supabase, файлы (флаеры, вложения) — Cloudflare R2.

- База данных: [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md)
- R2, переменные и секреты Cloudflare, Turnstile, письма: [`CLOUDFLARE_SETUP.md`](CLOUDFLARE_SETUP.md)

---

## ⚠️ Обновление существующего сайта: порядок релиза

Этот релиз переводит заявки, проверку, аккаунты и файлы на сервер (Pages Functions с service role key)
и закрывает анониму прямой доступ к таблицам. Порядок важен:

1. **Cloudflare → Variables and Secrets:** добавьте секрет `SUPABASE_SERVICE_ROLE_KEY`
   (Production и Preview). Без него форма `/submit`, одобрение заявок и аккаунты отвечают ошибкой.
2. **Задеплойте новую версию** (push в `main` или Retry deployment). Проверьте, что форма `/submit`
   отправляет заявку и админ видит её во входящих.
3. **Только после этого** выполните в Supabase SQL Editor миграцию
   `supabase/migrations/012_access_accounts_and_cleanup.sql`.
   Если запустить её раньше, старая версия сайта перестанет видеть события и принимать заявки.
4. По желанию: включите Turnstile (защита формы от ботов) и письма через Resend — см. `CLOUDFLARE_SETUP.md`.
   Оба выключены, пока не заданы их ключи; приложение работает и без них.

Если что-то пошло не так на шаге 2 — откатите деплой в Cloudflare (Deployments → Rollback);
база ещё не менялась, старая версия продолжит работать.

Миграция 012 удаляет политики и функции комментариев и RSVP. Сами таблицы `event_comments` и `rsvps`
она не трогает — строки `DROP TABLE` в конце файла закомментированы, раскомментируйте их, когда
убедитесь, что данные не нужны.

---

## Новый проект с нуля

### 1. Supabase

1. Создайте проект на https://supabase.com.
2. **SQL Editor** → вставьте и выполните **`supabase/setup.sql`** целиком.
   Это вся схема сразу; миграции из `supabase/migrations/` для нового проекта **не нужны**.
3. **Authentication → Sign In / Providers → Allow new users to sign up: OFF.**
4. Создайте первого администратора (см. `SUPABASE_SETUP.md`, раздел 4).
5. **Settings → API:** скопируйте **Project URL**, **anon public** key и **service_role** key.

### 2. Cloudflare R2

1. **R2 → Create bucket**, например `ccp-event-calendar-assets`.
2. Публичный доступ к bucket **не нужен**: файлы отдаёт функция `/api/file/...`.

### 3. Cloudflare Pages

1. **Workers & Pages → Create → Pages → Connect to Git**, выберите репозиторий.
2. Настройки сборки:
   - **Production branch:** `main`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
3. **Settings → Variables and Secrets** (для Production и Preview):

   | Имя | Тип | Обязательно | Зачем |
   |---|---|---|---|
   | `VITE_SUPABASE_URL` | переменная | да | адрес Supabase (встраивается в сборку, читают и функции) |
   | `VITE_SUPABASE_ANON_KEY` | переменная | да | публичный anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | **секрет** | да | заявки, проверка, аккаунты, файлы, календарные ссылки |
   | `VITE_TURNSTILE_SITE_KEY` | переменная | нет | виджет Turnstile на форме `/submit` |
   | `TURNSTILE_SECRET_KEY` | **секрет** | нет | проверка Turnstile на сервере |
   | `RESEND_API_KEY` | **секрет** | нет | письма через Resend |
   | `NOTIFY_FROM` | переменная | нет | отправитель, например `CCP Calendar <calendar@partnershipcork.ie>` |
   | `NOTIFY_ADMIN_EMAILS` | переменная | нет | кому писать о новых заявках (через запятую); по умолчанию — всем админам |
   | `APP_URL` | переменная | нет | адрес сайта в письмах; по умолчанию — адрес запроса |
   | `VITE_SUPABASE_REALTIME` | переменная | нет | `false` — опрашивать раз в минуту вместо Realtime |

   Без `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` сборка на Cloudflare Pages намеренно падает
   (иначе задеплоился бы белый экран). `VITE_*` встраиваются **во время сборки** — после их изменения
   нужен новый деплой.
4. **Settings → Bindings → R2 bucket:** имя переменной **`BUCKET`**, bucket из шага 2.
5. **Save and Deploy.** Сайт появится на `https://<project>.pages.dev`.
6. Свой домен (по желанию): **Custom domains** → добавьте домен и следуйте подсказкам по DNS.

### Через Wrangler CLI (альтернатива)

```bash
npm ci
npm run build            # VITE_* берутся из .env.local или окружения
npx wrangler pages deploy dist --project-name=ccp-event-calendar
```

Секреты и binding всё равно задаются в Dashboard (или `wrangler pages secret put`).

---

## Проверка после деплоя

1. Откройте сайт без входа → страница входа; `/submit` открывается без входа.
2. Отправьте тестовую заявку с флаером → «Thank you — event sent!». Если включён Resend — админам пришло письмо.
3. Войдите админом → баннер заявок, **Approve** публикует событие, **Decline** удаляет (с причиной — уходит письмо автору).
4. Меню аккаунта → **Staff accounts**: создайте аккаунт, скопируйте временный пароль, войдите им —
   приложение попросит сменить пароль.
5. **Export → Subscribe**: ссылка на ленту открывается и отдаёт `.ics`.
6. Консоль браузера (F12) без ошибок и без нарушений Content-Security-Policy.

---

## Обновление приложения

1. Push в `main`.
2. GitHub Actions (`.github/workflows/ci.yml`) прогоняет lint, проверку типов (приложение и функции),
   тесты, сборку и end-to-end тесты в браузере.
3. Cloudflare Pages автоматически собирает и выкладывает новую версию.
4. У открытых вкладок появится баннер «A new version of the calendar is available» — страница обновляется по нажатию,
   а не сама по себе, чтобы не потерять несохранённую форму.

Новые изменения базы — новый файл `supabase/migrations/0NN_*.sql` и те же правки в `supabase/setup.sql`.

---

## Troubleshooting

### Сборка падает
- Node.js 24+ (задан в `.nvmrc`).
- Проверьте, что `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY` заданы для нужного окружения (Production / Preview).

### `/submit`, одобрение или аккаунты отвечают «not set up on the server» / 500
- Нет `SUPABASE_SERVICE_ROLE_KEY` или он от другого проекта.
- После добавления секрета нужен новый деплой.

### Флаеры не загружаются, `/api/file/...` отвечает 500
- Нет R2 binding с именем ровно `BUCKET`.

### После входа нет событий
- Миграция 012 выполнена, а старая версия сайта ещё в кэше: обновите страницу (кнопка в баннере).
- Пользователя нет в таблице `users` (см. `SUPABASE_SETUP.md`, раздел «Troubleshooting»).

### Письма не приходят
- Нужны и `RESEND_API_KEY`, и `NOTIFY_FROM`; домен отправителя должен быть подтверждён в Resend.
- Ошибки отправки видны в логах функций: Workers & Pages → проект → Functions → Real-time logs.

### Ошибки в браузере у пользователей
- Необработанные ошибки приложения пишутся в таблицу `client_errors` (видна в Supabase Table Editor;
  хранится 90 дней, не больше 5000 строк).

---

## Полезные ссылки

- [Supabase Documentation](https://supabase.com/docs)
- [Cloudflare Pages Documentation](https://developers.cloudflare.com/pages/)
- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/)
- [Resend](https://resend.com/docs)
