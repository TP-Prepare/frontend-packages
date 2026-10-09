---
title: "BFF"
area: fullstack
do:
  iRedTea: front
  MrDuckVC: back
mentors: [YarikMix]
subtasks:
  - "tRPC (server)"
  - "Turborepo + bun workspaces"
  - "Orval"
pages: [contract, auth]
---

«tRPC (server)» — роутер tRPC в BFF, делает Валентин; остальные подзадачи — со стороны фронта (Денис).
Свой клиент tRPC — подтрек [«tRPC (client)»](./trpc-client): пакет `@cdd-team/trpc-client` живёт в монорепе фронтовых
библиотек [`frontend-packages`](https://github.com/Cringe-Driven-Development-Team/frontend-packages).

Браузер ходит только в BFF (Backend for Frontend): клиент вызывает процедуры tRPC, а BFF ходит в Go API.
Токены остаются на сервере и в браузер не попадают: у пользователя только зашифрованная cookie сессии.
Страница описывает целевое состояние трека; остальные — [Контракт](./bff/contract) (роутер tRPC, клиент к
Go от Orval и свой клиент tRPC) и [Авторизация и CSRF](./bff/auth) (сессия, refresh и защита от CSRF по
сценариям).

## Было и стало

Сейчас токены кладёт в cookie сам Go API, а браузер получает их напрямую:

```mermaid
flowchart LR
    B["Браузер"] -->|"cookie access_token, refresh_token, __Host-csrf"| C["Caddy"]
    C -->|"/api/v1/*"| A["Go API"]
```

После переезда между Caddy и Go появляется BFF:

```mermaid
flowchart LR
    B["Браузер"] -->|"cookie __Host-Http-session и заголовок X-CSRF: 1"| C["Caddy"]
    C -->|"/api/trpc/* на bff:3000"| P["BFF"]
    P -->|"GO_API_URL, на одной VPS http://api:8080/api/v1, и Authorization: Bearer"| A["Go API"]
```

Клиент вызывает процедуры tRPC на `/api/trpc`, данные те же; BFF ходит в Go на `/api/v1`. Текущая
маршрутизация — в
[`Caddyfile.j2`](https://github.com/Cringe-Driven-Development-Team/infra/blob/2f97437/ansible/roles/caddy/templates/Caddyfile.j2#L7)
(`reverse_proxy api:8080`); на одной VPS `api` не публикует порты и виден только из сети `app` — см.
[`compose.yml.j2`](https://github.com/Cringe-Driven-Development-Team/infra/blob/2f97437/ansible/roles/app/templates/compose.yml.j2#L18).

## Cookie до и после

| Cookie | `Path` | `HttpOnly` | `SameSite` | Кто читает |
|---|---|---|---|---|
| `access_token` (сейчас) | `/api/v1` | да | `Lax` | Go API |
| `refresh_token` (сейчас) | `/api/v1/auth` | да | `Lax` | Go API |
| `__Host-csrf` (сейчас) | `/` | **нет** | `Lax` | фронт читает из `document.cookie`, Go сверяет |
| `__Host-Http-session` (после) | `/` | да | `Strict` | только BFF; в браузере JavaScript её не видит |

Подробности про нынешние cookie — в разделе [CSRF](/security/csrf/). `__Host-Http-session` —
`Secure`, без `Domain`, срок `Max-Age` равен `refresh_expires_in`.

## Почему BFF

RFC 10017 «OAuth 2.0 for Browser-Based Applications» (BCP 212) перечисляет архитектуры браузерных
приложений ([§6](https://www.rfc-editor.org/rfc/rfc10017#section-6)) и ставит BFF первой:

> The patterns in this section are presented in decreasing order of security.

Про BFF отдельно
([§6.1.4.3](https://www.rfc-editor.org/rfc/rfc10017#section-6.1.4.3)):

> This architecture is strongly recommended for business applications, sensitive applications, and applications that handle personal data.

У нас личные данные пользователей, так что рекомендация подходит. Практический выигрыш: access и
refresh не доходят до браузера, а значит, XSS на странице не может их украсть. Но XSS всё равно может
слать запросы через BFF от имени пользователя: это сценарий «Proxying Requests via the User's Browser»
в [RFC 10017 §6.1.4.1](https://www.rfc-editor.org/rfc/rfc10017#section-6.1.4.1). BFF убирает кражу
токенов, но не последствия XSS.

## Что меняется

### Фронт

Клиент создаётся в
[`src/api/client.ts`](https://github.com/frontend-park-mail-ru/2026_2_Cringe_Driven_Development/blob/344ad0b/src/api/client.ts#L29)
с `baseUrl: '/api/v1'` и `credentials: 'include'`. Его заменяет свой клиент tRPC (`@cdd-team/trpc-client` из
[`frontend-packages`](https://github.com/Cringe-Driven-Development-Team/frontend-packages), см. [«Клиент»](./bff/contract#клиент)): типы процедур — `import type { AppRouter }` из BFF, на каждый
вызов `X-CSRF: 1`, cookie он не читает. Refresh на `401` и повтор после `403` уходят; `UNAUTHORIZED`
означает гостя и форму входа; старт приложения — `users.me`. Задача frontend#34 становится не нужна.

### BFF

Новый сервис на Hono с роутером tRPC на `/api/trpc` (см. [«Роутер»](./bff/contract#роутер)).
`createContext` проверяет `X-CSRF`, `Origin` и `Sec-Fetch-Site` и расшифровывает cookie сессии;
`authedProcedure` требует сессию и сам обновляет access. Вызовы Go — fetch-клиент от Orval, вход
процедур — zod-схемы от Orval из контракта Go. Работает без своего хранилища. Гонка backend#12
решается внутри BFF, пока он один экземпляр — см. сценарий [«Две вкладки»](./bff/auth#две-вкладки).

### Go API

`Authenticate` сейчас читает access из cookie
[`access_token`](https://github.com/go-park-mail-ru/2026_2_Cringe_Driven_Development/blob/4094350/internal/middleware/authenticate.go#L19),
хотя контракт уже говорит про `Authorization: Bearer`. После переезда он читает `Authorization: Bearer`,
токены отдаются в JSON, а middleware CSRF и CORS, код cookie и переменные `CSRF_SECRET`,
`COOKIE_SECURE`, `CORS_ALLOWED_ORIGINS` удаляются.

### Infra

В compose появляется сервис `bff` с `SESSION_KEY` и `APP_ORIGIN`, а Caddy направляет `/api/trpc/*` на
`bff:3000`.

## Переключение

Go, BFF и Caddy выкатываются одним прогоном playbook, сразу после него промоутится релиз клиента.
Пока клиент не промоутнут, старый клиент ходит на `/api/v1`, которого снаружи больше нет, и получает
ошибки: это окно длится столько, сколько проходит между двумя шагами. Ответы BFF на `auth.login`,
`auth.register` и `auth.logout` стирают три старые cookie с их
`Path`: `access_token` (`/api/v1`), `refresh_token` (`/api/v1/auth`) и `__Host-csrf` (`/`). Каждый
пользователь один раз входит заново — см. сценарий
[«Первый вход после переезда»](./bff/auth#первыи-вход-после-переезда).

## Две VPS

Целевая схема для двух машин. Сейчас стек Pulumi — одна VPS, а двухсерверная схема (gateway и backend)
заморожена в варианте `bff` документации
([`pulumi/README.md`](https://github.com/Cringe-Driven-Development-Team/infra/blob/2f97437/pulumi/README.md#L8)).

```mermaid
flowchart LR
    B["Браузер"] -->|"cellestial.ru"| C
    subgraph V1["VPS1, публичный IP"]
        C["Caddy"] --> P["BFF"]
    end
    P -->|"частная сеть: Authorization: Bearer и X-BFF-Key"| A
    subgraph V2["VPS2, без публичного IP"]
        A["Go API"] --> D[("Postgres")]
    end
```

- **VPS1:** Caddy и BFF, публичный (floating) IP, домен `cellestial.ru`. **VPS2:** Go API и Postgres, без
  публичного IP, доступна только через частную сеть Selectel.
- **Домен один.** Публичного `api.cellestial.ru` нет: по схеме BFF браузер говорит только с BFF, а
  приложение живёт на одном origin с ним. RFC 10017
  ([§6.1.3.3.2](https://www.rfc-editor.org/rfc/rfc10017#section-6.1.3.3.2)) прямо допускает такую схему:

  > It is also possible to deploy the browser-based application on the same origin as the BFF.

  Отдельный публичный `api.*` нужен только другим клиентам, например мобильному приложению или
  партнёрам, и для них это `Authorization: Bearer` или OAuth, а не cookie.
- **BFF → Go** идёт на приватный адрес VPS2. Файрвол VPS2 (security group) пускает порт API и SSH
  только с VPS1; порт Postgres наружу не открыт вообще.
- **Адрес Go** BFF берёт из переменной `GO_API_URL`: на одной VPS это `http://api:8080`, на двух —
  `http://<приватный адрес VPS2>:8080`. На VPS2 compose публикует порт API только на приватном
  интерфейсе.
- **S2S-ключ.** BFF шлёт заголовок `X-BFF-Key: <BFF_API_KEY>`, Go сравнивает значение за постоянное
  время (`crypto/subtle.ConstantTimeCompare`, для ключа фиксированной длины этого достаточно) и
  проверяет ключ раньше Bearer. Без ключа или с неверным — `403` с кодом `s2s_forbidden`, не `401`:
  на `401` BFF обновил бы токены, refresh с тем же ключом тоже получил бы отказ, и BFF стёр бы cookie
  сессии. BFF считает `s2s_forbidden` инфраструктурной ошибкой: отвечает клиенту `502`, пишет в лог,
  refresh не делает и сессию не трогает. `BFF_API_KEY` лежит в `.env` обеих машин. Ротация: Go на время
  переключения принимает два ключа, старый и новый. Сильнее — mTLS между VPS1 и VPS2.
- **Без TLS внутри частной сети** — принятый риск MVP: Selectel изолирует приватную сеть. mTLS его бы
  закрыл.
- **Ansible** ходит на VPS2 по SSH только через VPS1 как jump host (`ProxyJump`): публичного адреса у
  VPS2 нет. Динамический inventory группирует хосты по `metadata.role`
  ([`openstack.yml`](https://github.com/Cringe-Driven-Development-Team/infra/blob/2f97437/ansible/inventory/openstack.yml#L17)),
  так что у второй машины будет своя роль.
- **Уже есть в Pulumi:** `private-network`, `private-subnet` и `router`
  ([`index.ts`](https://github.com/Cringe-Driven-Development-Team/infra/blob/2f97437/pulumi/index.ts#L181-L201)),
  инстанс `gateway` на порту частной подсети с floating IP
  ([`index.ts`](https://github.com/Cringe-Driven-Development-Team/infra/blob/2f97437/pulumi/index.ts#L250-L280)).
  Ресурсы backend-сервера удалены, и возвращать их под прежним именем нельзя до проверки стейта
  ([`README`](https://github.com/Cringe-Driven-Development-Team/infra/blob/2f97437/pulumi/README.md#L287)).
- **Нужно добавить:** инстанс и порт VPS2 под новым именем, security group и `ProxyJump` в inventory.
  Сейчас sshd запрещает `AllowTcpForwarding`, и в роли отмечено, что jump-хост не нужен
  ([`ssh_hardening`](https://github.com/Cringe-Driven-Development-Team/infra/blob/2f97437/ansible/roles/ssh_hardening/tasks/main.yml#L14-L16)),
  так что для jump host на VPS1 это придётся изменить.

## Ограничения

- Смена `SESSION_KEY` разлогинивает всех: старые cookie больше не расшифровываются.
- На одной VPS Go API закрыт только сетью compose, без S2S-ключа: из этой сети любой сервис может
  позвать его напрямую. На двух VPS есть ключ `X-BFF-Key` и файрвол, см. [«Две VPS»](#две-vps).
- BFF работает одним экземпляром: объединение одновременных refresh держится в его памяти. Второй
  экземпляр потребует общую блокировку refresh (Redis) или льготное окно из [backend#12](https://github.com/Cringe-Driven-Development-Team/backend/issues/12).

## tRPC

Между клиентом и BFF всё ходит через tRPC, клиент переключается разом: проект учебный, реальных
пользователей нет. Девять процедур названы по ресурсам Go (`auth.*`, `users.me`, `notebooks.*`,
`cells.*`); если экрану нужно больше одного вызова Go, для него заводится процедура `views.*`. Клиент
tRPC свой, типы он берёт из `AppRouter`. Подробности — [«Контракт»](./bff/contract).
