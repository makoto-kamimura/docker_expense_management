# docs

仕様書の本体はリポジトリ直下の [readme.md](../readme.md)。`docs/` には、それ以外の資料を種類ごとのフォルダに分けて置く。

| フォルダ | 置くもの | 書く人 |
|---|---|---|
| [design/](design/) | 設計・計画の資料（実装計画・本番運用設計など） | 人 |
| [runbooks/](runbooks/) | 運用手順書（[運用手順書](runbooks/operation.md)。アラートごと・作業ごとの手順もここに足す） | 人 |
| [incidents/](incidents/) | 障害のふりかえり（`YYYY-MM-DD-<概要>.md`） | 人 |
| [automation/](automation/) | 仕分けと実装のルーティンの手順（`triage.md`・`implement.md`） | 人（エージェントに変えさせない） |
| [tasks/](tasks/) | 不具合・要望・残作業のタスク（[残タスク](tasks/task.md)） | 人・仕分けのルーティン |

- まだ中身のないフォルダには、フォルダを git に残すための `.gitkeep` を置いている。中身ができても消さなくてよい。
- 不具合・要望のタスクは `tasks/` にだけ置く。設計・運用の資料と混ぜない。
- 変更の履歴は git のコミットと、[残タスク](tasks/task.md)の「対応済み」に残す。仕様の決定は readme の[決定事項](../readme.md#23-決定事項)に残す。
