---
name: rule-actions-spec
description: >-
  Maintains product specifications for PT Application Firewall features
  prototyped in this addon. Use when the user adds, changes, clarifies, or
  cancels requirements for bulk rule actions, Log to DB, Custom response, Send
  TCP RST, Send to syslog, the rule list, filters, criticality, the apply
  dialog, policy and template comparison, exclusions, skipped parts, or
  inheritance. Updates docs/rule-actions.spec.md and
  docs/policy-compare.spec.md so developers can implement the behavior in the
  product UI rather than in the browser addon.
---

# Спецификации прототипа

## Куда писать

- Массовые действия на правилах — `docs/rule-actions.spec.md`.
- Сравнение политики и шаблона — `docs/policy-compare.spec.md`.

Обновляй нужный файл в том же ходе, если сообщение пользователя меняет это поведение. Правка аддона тоже считается требованием к продукту.

Не обновляй спецификацию из-за правок, которые не меняют поведение: версия расширения, вёрстка только аддона, опечатка в коде.

## Как писать

- Спецификация описывает штатный интерфейс политики и шаблона PT AF. Не переноси в неё устройство аддона: shadow DOM, manifest, токен, предупреждение про addon, галку в настройках расширения.
- Актуальные требования держи в основных разделах. Заменённое требование убери оттуда и одной строкой запиши в «История требований»: дата и что перестало быть верным.
- Формулируй проверяемо: что видно в окне, какие правила и записи сравниваются, что делает подтверждённая запись.
- Не добавляй поведение, которого пользователь не просил.
- Пиши по-русски. Имена действий оставляй как в продукте: Log to DB, Custom response, Send TCP RST, Send to syslog.

## После правки

В ответе пользователю назови, какой файл и какой пункт спецификации изменился.
