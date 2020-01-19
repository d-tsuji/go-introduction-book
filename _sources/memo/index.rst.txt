==========================
メモ
==========================

* cli のたたき台として `gh-pages <https://www.npmjs.com/package/gh-pages#command-line-utility>`_ を Go で実装する
  * go-git を使って git を操作すると pure go になっておしゃれ

.. note:: go-git で同様の操作ができるかどうかは要確認

go-gh-pages
==========================

* あるディレクトリにgit cloneする。

.. code-block:: bash

    git clone 'https://github.com/d-tsuji/test-go-gh-pages.git' tempDir --branch xxx --single-branch --origin origin --depth 1

ブランチが存在しない場合はエラーになるので、その場合はオプションを変更して再度 git clone する。

.. code-block:: bash

    git clone 'https://github.com/d-tsuji/test-go-gh-pages.git' tempDir --origin origin

* リポートリポジトリの URL を取得する

.. code-block:: bash

    git config --get remote.origin.url

* アントラッキングなファイルを強制的に削除する

.. code-block:: bash

    git clean -f -d
    # ちなみに git のオプション的には以下のようになっている。
    # git clean -h
    # usage: git clean [-d] [-f] [-i] [-n] [-q] [-e <pattern>] [-x | -X] [--] <paths>...
    #
    #     -q, --quiet           do not print names of files removed
    #     -n, --dry-run         dry run
    #     -f, --force           force
    #     -i, --interactive     interactive cleaning
    #     -d                    remove whole directories
    #     -e, --exclude <pattern>
    #                         add <pattern> to ignore rules
    #     -x                    remove ignored files, too
    #     -X                    remove only ignored files

* リモートリポジトリから fetch する


* リモートリポジトリから checkout する

リモートリポジトリにターゲットのブランチが存在するかチェックする

.. code-block:: bash

    git ls-remote --exit-code  . origin/gh-pages

リモートに存在しない場合はローカルに ``--orphan`` オプションを付けてブランチを作成する

.. code-block:: bash

    git checkout --orphan gh-pages

リモートに存在する場合はローカルで初期化する

.. code-block:: bash

    git clean -f -d
    git reset --hard origin/gh-pages

ちなみに ``git checkout`` のオプションは以下。

.. code-block:: bash

    #git checkout -h
    #usage: git checkout [<options>] <branch>
    #or: git checkout [<options>] [<branch>] -- <file>...
    #
    #    -b <branch>           create and checkout a new branch
    #    -B <branch>           create/reset and checkout a branch
    #    -l                    create reflog for new branch
    #    --guess               second guess 'git checkout <no-such-branch>' (default)
    #    --overlay             use overlay mode (default)
    #    -q, --quiet           suppress progress reporting
    #    --recurse-submodules[=<checkout>]
    #                        control recursive updating of submodules
    #    --progress            force progress reporting
    #    -m, --merge           perform a 3-way merge with the new branch
    #    --conflict <style>    conflict style (merge or diff3)
    #    -d, --detach          detach HEAD at named commit
    #    -t, --track           set upstream info for new branch
    #    -f, --force           force checkout (throw away local modifications)
    #    --orphan <new-branch>
    #                        new unparented branch
    #    --overwrite-ignore    update ignored files (default)
    #    --ignore-other-worktrees
    #                        do not check if another worktree is holding the given ref
    #    -2, --ours            checkout our version for unmerged files
    #    -3, --theirs          checkout their version for unmerged files
    #    -p, --patch           select hunks interactively
    #    --ignore-skip-worktree-bits
    #                        do not limit pathspecs to sparse entries only

* 強制的な更新( ``-f`` )を許容するかどうか

* 追加のみ(既存のファイルを削除しない)の設定するかどうか

デフォルトの設定ではすべて更新するモードになっている。以下の git コマンドでファイルを削除している。

.. code-block:: bash

    git rm --ignore-unmatch -r -f files
    #git rm --ignore-unmatch -r -f .

* ファイルのコピーをする

元のディレクトリの対象のディレクトリパス(basePath)からファイルを対象の新しく作成したディレクトリにコピーする

* ファイルのトラッキングをする(git add)

.. code-block:: bash

    git add .

* git config の設定をする

.. code-block:: bash

    git confil.email xxx
    git confil.user xxx

* コミットする

.. code-block:: bash

    git diff-index --quiet HEAD
    git commit -m "update"

* タグを打つかどうか

* プッシュする

.. code-block:: bash

    git push --tags origin gh-pages
    git commit -m "update"
