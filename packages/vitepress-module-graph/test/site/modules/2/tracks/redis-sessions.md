---
title: "Сессии в Redis: отзыв refresh-токенов"
label: "Сессии в Redis"
area: back
do:
  GrayMouse9: back
  iRedTea: devops
mentors: [blackHATred]
subtasks:
  - "Redis в compose через Ansible"
  - "Refresh-сессии в Redis вместо refresh_sessions"
  - "Отзыв refresh-токена"
  - "Смена пароля — отзыв всех сессий, кроме текущей"
related:
  - track: bff
    why: "auth.logout отзывает refresh-токен в Go; refresh делает BFF"
  - track: profile
    why: "Смена пароля — в профиле; после неё — отзыв остальных сессий"
---

Предложила преподаватель: refresh-токены — в Redis, механизм их отзыва и при смене пароля — отзыв всех
сессий, кроме текущей.

## Что сейчас

Access-токен — JWT, его не хранят: бэк проверяет подпись. В Postgres лежат refresh-сессии — таблица
`refresh_sessions` (`user_id`, `token_hash`, `expires_at`,
[миграция](https://github.com/go-park-mail-ru/2026_2_Cringe_Driven_Development/blob/409435082509e139417613487c47a91a9ad56f80/migrations/20260924184539_create_refresh_sessions.sql)). Их и переносим: в Redis срок жизни сессии — TTL, истёкшие удаляются сами.

## Решения

- **Redis — контейнер в compose рядом с Postgres, выкатывает Ansible.** Так же, как Postgres, и бесплатно.
  Управляемый Redis Selectel через Pulumi не берём: платный кластер, а Postgres у нас не управляемый.
- **Бэк — Даша** (она же на бэке профиля, где смена пароля), **инфра — Денис**, **ментор — Саша.**

## Не входит

Сессии по устройствам — список устройств и «выйти с этого устройства», как в Telegram: доп. фича, не в
этом модуле.
