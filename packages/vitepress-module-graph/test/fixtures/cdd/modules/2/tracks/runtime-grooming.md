---
title: "Техгруминг: окружения пользователей в Selectel"
label: "Техгруминг окружений"
area: back
do:
  blackHATred: back
subtasks:
  - "Контейнеры в Selectel: Managed Kubernetes или Docker на своих VM"
  - "Изоляция чужого кода"
  - "Декомпозиция «Авто-VPS»"
  - "Архитектурные схемы"
related:
  - track: notebook-vps
    why: Архитектура и выбор VPS или контейнеров для трека
---

Саша разбирается, как запускать окружения пользователей в облаке Selectel, и по итогам проектирует
архитектуру треков [«Авто-VPS»](./notebook-vps) и [«Исполнение файлов»](./file-exec). Бэкенд-часть
окружений — создание и удаление через API облака — по словам Саши, будет в «Исполнении файлов». Всё
сильно взаимосвязано, поэтому сначала декомпозиция и архитектурные схемы: без них студенты запутаются.

## Что уже известно

- **VPS из Go — проверено.** Наш Pulumi создаёт VPS через `@pulumi/openstack`, а он собран из
  `terraform-provider-openstack` на [gophercloud](https://github.com/gophercloud/gophercloud):
  вызовы API OpenStack Selectel из Go уже работают.
- **Контейнеры — нужно разобраться:**
  - Managed Kubernetes Selectel есть в Terraform-провайдере `selectel`
    ([`selectel_mks_cluster_v1`](https://docs.selectel.ru/en/terraform/selectel-provider-reference/resources/mks_cluster_v1/)),
    поды бэк создавал бы через Kubernetes API;
  - Docker на своих VM: хосты поднимает Pulumi, контейнерами бэк управляет через Docker Engine API;
  - serverless-контейнеры Selectel в документации не нашлись.

## Результат

- Сравнение вариантов: цена, время старта окружения, изоляция чужого кода, API для бэка.
- Архитектурные схемы и декомпозиция «Авто-VPS» на задачи: что делает бэк, что devops, что фронт.
  «Исполнение файлов» Саша декомпозирует отдельно —
  [«Техгруминг исполнения файлов»](./file-exec-grooming).
