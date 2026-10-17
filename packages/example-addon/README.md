# @tp-prepare/example-addon

Потребитель [`@tp-prepare/example-core`](../example-core) в учебном примере release-please.
`core` указан в `dependencies`, поэтому устанавливается вместе с `addon`.

```ts
import { greetAll } from "@tp-prepare/example-addon";

greetAll(["Alice", "Bob"]); // ["Hello, Alice!", "Hello, Bob!"]
```

Сборка сохраняет импорт `@tp-prepare/example-core`, не встраивая его реализацию.
Сценарии релизов и настройка npm описаны в [README монорепозитория](../../README.md).
