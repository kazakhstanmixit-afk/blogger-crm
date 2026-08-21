# Деплой на Render.com — пошаговая инструкция

## Шаг 1. Залить код на GitHub

1. Зайди на https://github.com и создай новый репозиторий (назови `blogger-crm`)
2. Загрузи все файлы этого проекта в репозиторий

## Шаг 2. Создать Web Service на Render

1. Зайди на https://render.com
2. Нажми **New → Web Service**
3. Подключи GitHub репозиторий `blogger-crm`
4. Настройки:
   - **Name**: blogger-crm (или любое)
   - **Root Directory**: оставь пустым
   - **Build Command**: `cd client && npm install && npm run build && cd ../server && npm install`
   - **Start Command**: `cd server && node index.js`
   - **Instance Type**: Free

## Шаг 3. Environment Variables (очень важно!)

В Render → Settings → Environment Variables добавь:

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | любая длинная случайная строка, например `mySuperSecret2024xyz` |
| `PORT` | `3001` |

## Шаг 4. Persistent Disk (чтобы база не сбрасывалась)

1. В Render → Disks → Add Disk
2. Name: `crm-data`
3. Mount Path: `/data`
4. Size: 1 GB (бесплатно)

Затем добавь переменную:
| Key | Value |
|-----|-------|
| `DB_PATH` | `/data/crm.db` |

## Шаг 5. Деплой

Нажми **Deploy** — Render сам соберёт и запустит.
Через 5–10 минут твой CRM будет на адресе типа `https://blogger-crm.onrender.com`

## Первый вход

- Логин: `admin`
- Пароль: `admin123`

**Сразу смени пароль!** В разделе "Менеджеры" создай нужных пользователей.

## Добавление менеджеров

Войди как admin → вкладка "Менеджеры" → добавь логин и пароль для каждого менеджера.
Каждый менеджер видит всю базу, но в аналитике можно фильтровать по ответственному.
