# @tp-prepare/example-core

Базовый пакет учебного примера release-please. Его использует
[`@tp-prepare/example-addon`](../example-addon).

```ts
import { greet } from "@tp-prepare/example-core";

greet("Alice"); // "Hello, Alice!"
greet("  Alice  "); // "Hello, Alice!" — краевые пробелы удаляются
```

Как проверить каскадное обновление зависимости и настроить публикацию —
в [README монорепозитория](../../README.md).
