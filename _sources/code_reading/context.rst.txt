============================================
context
============================================

概要
============================================

Context 型を提供するパッケージでデッドラインやキャンセルのシグナルやAPIの境界を超えてプロセス間でリクエストの値を渡す

Context インターフェースは4つのメソッドで構成される。コメントを除くと以下のようになる。

.. code-block:: go

    type Context interface {
        Deadline() (deadline time.Time, ok bool)
        Done() <-chan struct{}
        Err() error
        Value(key interface{}) interface{}
    }

Contextを作るには2つのファクトリ関数が存在する。親になる基点。

- ``func Background() Context``
- ``func TODO() Context``

メソッドは以下の4つ

- ``func WithCancel(parent Context) (ctx Context, cancel CancelFunc)``
- ``func WithDeadline(parent Context, d time.Time) (Context, CancelFunc)``
- ``func WithTimeout(parent Context, timeout time.Duration) (Context, CancelFunc)``
- ``func WithValue(parent Context, key, val interface{}) Context``

とりあえず動かしてみる
--------------------------------------------

.. code-block:: go

    package main

    import (
        "context"
        "fmt"
        "time"
    )

    func Process(ctx context.Context, id int) {
        for {
            select {
            // ctx.Done() 自体はチャネルを返す(かつ自身が持っているコンテキストのフィールドにチャネルをセット)
            // しかし close() されていないためこの case が選択されない
            case <-ctx.Done():
                fmt.Printf("[goroutine %d] Process is canceled.\n", id)
                return
            default:
                fmt.Printf("[goroutine %d] Processing...\n", id)
                time.Sleep(1 * time.Second)
                // something do...
            }
        }
    }

    func main() {
        fmt.Printf("[goroutine main] start\n")
        ctx, cancel := context.WithCancel(context.Background())
        go Process(ctx, 1)
        go Process(ctx, 2)

        time.Sleep(1 * time.Second)

        cancel()

        time.Sleep(5 * time.Second)
        fmt.Printf("[goroutine main] finish\n")
    }

https://play.golang.org/p/l0rREisGyUQ

::

    [goroutine main] start
    [goroutine 1] Processing...
    [goroutine 2] Processing...
    [goroutine 1] Processing...
    [goroutine 2] Process is canceled.
    [goroutine 1] Process is canceled.
    [goroutine main] finish

実装
============================================

全体的な構成(キャンセルの場合)
--------------------------------------------

- cancelCtx という構造体がコンテキストの状態を保持する重要な構造体
- 埋め込みされている ``Context`` によって親コンテキストを保持する
- ``children map[canceler]struct{}`` が子コンテキストの一覧を保持する 

.. code-block:: go

    // cancelCtx はキャンセル可能
    // キャンセルされた場合は canceler インターフェースを実装している子どももキャンセルする
    type cancelCtx struct {
        Context

        mu       sync.Mutex            // protects following fields
        done     chan struct{}         // created lazily, closed by first cancel call
        children map[canceler]struct{} // set to nil by the first cancel call
        err      error                 // set to non-nil by the first cancel call
    }

    // Done は c.done にチャネルを初期化(後にcloseされる)
    func (c *cancelCtx) Done() <-chan struct{} {
        c.mu.Lock()
        if c.done == nil {
            c.done = make(chan struct{})
        }
        d := c.done
        c.mu.Unlock()
        return d
    }

    func (c *cancelCtx) Err() error {
        c.mu.Lock()
        err := c.err
        c.mu.Unlock()
        return err
    }

    func (c *cancelCtx) String() string {
        return contextName(c.Context) + ".WithCancel"
    }

.. code-block:: go

    // A canceler is a context type that can be canceled directly. The
    // implementations are *cancelCtx and *timerCtx.
    type canceler interface {
        cancel(removeFromParent bool, err error)
        Done() <-chan struct{}
    }

.. code-block:: go

    // closedchan is a reusable closed channel.
    var closedchan = make(chan struct{})

    // init 時にcloseするので常にクローズしたチャネルを取得
    func init() {
        close(closedchan)
    }

``func WithCancel(parent Context) (ctx Context, cancel CancelFunc)``
----------------------------------------------------------------------------

.. code-block:: go

    func WithCancel(parent Context) (ctx Context, cancel CancelFunc) {
        // cancelCtx 構造体の作成(ファクトリメソッド)
        c := newCancelCtx(parent)

        // コンテキストの親子関係のグラフを構築
        propagateCancel(parent, &c)

        // 子の cancelCtx と子の cancelCtx に紐づくキャンセル関数を返却
        // 親から CancelFunc を呼ぶことで cancelCtx の cancel が実行される
        // この場合のみ親と子が分離される
        return &c, func() { c.cancel(true, Canceled) }
    }

    func newCancelCtx(parent Context) cancelCtx {
        // cancelCtx の Context 以外のフィールドはゼロ値で初期化
        return cancelCtx{Context: parent}
    }

.. code-block:: go

    // propagateCancel は親がキャンセルされた場合に、子をキャンセルする
    func propagateCancel(parent Context, child canceler) {
        // 親の場合(emptyCtx)は ctx.Done() == nil
        // 親の場合はキャンセル処理をせず、アーリーリターン
        if parent.Done() == nil {
            return // parent is never canceled
        }

        // キャンセル処理の準備として map でグラフを形成
        // 親コンテキストが cancelCtx 型
        if p, ok := parentCancelCtx(parent); ok {
            p.mu.Lock()
            if p.err != nil {
                // parent has already been canceled
                child.cancel(false, p.err)
            } else {
                if p.children == nil {
                    p.children = make(map[canceler]struct{})
                }
                p.children[child] = struct{}{}
            }
            p.mu.Unlock()
        // 親コンテキストがcancelCtx型ではない場合(valueCtx型)
        } else {
            go func() {
                select {
                case <-parent.Done():
                    child.cancel(false, parent.Err())
                case <-child.Done():
                }
            }()
        }
    }

    // parentCancelCtx は *cancelCtx が見つかるか emptyCtx が見つかるまでコンテキストグラフを逆向きにたどる
    // 
    // parentCancelCtx follows a chain of parent references until it finds a
    // *cancelCtx. This function understands how each of the concrete types in this
    // package represents its parent.
    func parentCancelCtx(parent Context) (*cancelCtx, bool) {
        for {
            switch c := parent.(type) {
            case *cancelCtx:
                return c, true
            case *timerCtx:
                return &c.cancelCtx, true
            case *valueCtx:
                parent = c.Context
            default:
                return nil, false
            }
        }
    }

    // cancel closes c.done, cancels each of c's children, and, if
    // removeFromParent is true, removes c from its parent's children.
    //
    // cancel は本質的にはチャネルのクローズ
    func (c *cancelCtx) cancel(removeFromParent bool, err error) {
        if err == nil {
            panic("context: internal error: missing cancel error")
        }
        c.mu.Lock()
        if c.err != nil {
            c.mu.Unlock()
            return // already canceled
        }

        // キャンセルされた理由をセット
        c.err = err

        // チャネルのクローズ
        if c.done == nil {
            c.done = closedchan
        } else {
            close(c.done)
        }

        // map から key を取得
        for child := range c.children {
            // NOTE: acquiring the child's lock while holding parent's lock.
            // 葉の方向にキャンセル
            child.cancel(false, err)
        }
        // 子の canceler はすべてキャンセル済なので map を空にする
        c.children = nil
        c.mu.Unlock()

        if removeFromParent {
            removeChild(c.Context, c)
        }
    }

.. code-block:: go

    // removeChild は親から(今呼ばれた)子を分離
    func removeChild(parent Context, child canceler) {
        p, ok := parentCancelCtx(parent)
        if !ok {
            return
        }
        p.mu.Lock()
        // 親のコンテキストが持っている子コンテキストの map から子コンテキスト自身を削除
        if p.children != nil {
            delete(p.children, child)
        }
        p.mu.Unlock()
    }

全体的な構成(デッドライン付の場合)
--------------------------------------------

- ``timerCtx`` という構造体が ``cancelCtx`` を内包している
- 加えて時間に関する状態 ``timer *time.Timer`` と ``deadline time.Time`` を持っている

.. code-block:: go

    type timerCtx struct {
        cancelCtx
        timer *time.Timer // Under cancelCtx.mu.

        deadline time.Time
    }

    // Deadline() は timeCtx の deadline へのゲッター
    func (c *timerCtx) Deadline() (deadline time.Time, ok bool) {
        return c.deadline, true
    }

    func (c *timerCtx) String() string {
        return contextName(c.cancelCtx.Context) + ".WithDeadline(" +
            c.deadline.String() + " [" +
            time.Until(c.deadline).String() + "])"
    }

    // timeCtx の cancel 自体は cancelCtx で保持している cancel メソッドへのラッパーとなっている
    func (c *timerCtx) cancel(removeFromParent bool, err error) {
        c.cancelCtx.cancel(false, err)
        if removeFromParent {
            // Remove this timerCtx from its parent cancelCtx's children.
            removeChild(c.cancelCtx.Context, c)
        }
        c.mu.Lock()
        // time.AfterFunc によるキャンセル処理と重複しないように、すでに設定されていれば無効化する
        if c.timer != nil {
            c.timer.Stop()
            c.timer = nil
        }
        c.mu.Unlock()
    }

[補足] timeパッケージ
--------------------------------------------

- ``context`` パッケージで用いられている ``time`` パッケージのいくつかの関数を補足しておく

``func (t Time) Before(u Time) bool``
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

時刻を比較。サンプルコードが分かりやすいのでそのまま転記

.. code-block:: go

    year2000 := time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC)
    year3000 := time.Date(3000, 1, 1, 0, 0, 0, 0, time.UTC)

    isYear2000BeforeYear3000 := year2000.Before(year3000) // True
    isYear3000BeforeYear2000 := year3000.Before(year2000) // False

    fmt.Printf("year2000.Before(year3000) = %v\n", isYear2000BeforeYear3000)
    fmt.Printf("year3000.Before(year2000) = %v\n", isYear3000BeforeYear2000)

``func Until(t Time) Duration``
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

現在時刻から t までの期間を返却する。``t.Sub(time.Now())`` と同じ。現在よりも前の時刻と比較する場合は負の結果が返ってくる。

.. code-block:: go

    package main

    import (
        "fmt"
        "time"
    )

    func main() {
        // playground 上はいつも "2009-11-10 23:00:00 UTC"
        year20091111 := time.Date(2009, 11, 11, 23, 0, 0, 0, time.UTC)

        fmt.Printf("t.until(year20091111) = %v\n", time.Until(year20091111))
    }
    // t.until(year20091111) = 24h0m0s

https://play.golang.org/p/Xvpadl3dm81

``func AfterFunc(d Duration, f func()) *Timer``
----------------------------------------------------------------------------

``d`` の時間経過後に ``f func()`` を実行する

.. code-block:: go

    package main

    import (
        "fmt"
        "os"
        "time"
    )

    func main() {
        time.AfterFunc(3 * time.Second, func() {
            fmt.Println("Timeout")
            os.Exit(0)
        })

        select {}
    }
    // Timeout ※ 3秒経過後に

https://play.golang.org/p/SgbuZyi3qk2

``func WithDeadline(parent Context, d time.Time) (Context, CancelFunc)``
----------------------------------------------------------------------------

``WithCancel`` に ``d`` を組み合わせたラッパー

.. code-block:: go

    func WithDeadline(parent Context, d time.Time) (Context, CancelFunc) {
        if cur, ok := parent.Deadline(); ok && cur.Before(d) {
            // The current deadline is already sooner than the new one.
            return WithCancel(parent)
        }
        c := &timerCtx{
            cancelCtx: newCancelCtx(parent),
            // input の期限を保持
            deadline:  d,

            // timer *time.Timer は time.AfterFunc でセットされる
        }
        // グラフの構築
        propagateCancel(parent, c)

        // すでに期限到来の場合はキャンセルする
        dur := time.Until(d)
        if dur <= 0 {
            c.cancel(true, DeadlineExceeded) // deadline has already passed
            return c, func() { c.cancel(false, Canceled) }
        }
        c.mu.Lock()
        defer c.mu.Unlock()

        // time.AfterFunc を使用して dur 時間経過後にキャンセルを実行
        if c.err == nil {
            c.timer = time.AfterFunc(dur, func() {
                c.cancel(true, DeadlineExceeded)
            })
        }
        return c, func() { c.cancel(true, Canceled) }
    }

``func WithTimeout(parent Context, timeout time.Duration) (Context, CancelFunc)``
------------------------------------------------------------------------------------

こちらも ``WithDeadline`` のラッパー。期限を指定された場合は、現在時刻に期限を追加した時刻として ``WithDeadline`` を呼び出すようになっている

.. code-block:: go

    func WithTimeout(parent Context, timeout time.Duration) (Context, CancelFunc) {
        return WithDeadline(parent, time.Now().Add(timeout))
    }

WithValueの場合
--------------------------------------------

- キャンセル処理ではなく、値を引き回すためのコンテキスト
- 元のコンテキストに key, value をラップしたコンテキストを返すだけ

どんな感じで使われているか？
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

構造体の key, value を持つコンテキストということが実装からもわかる

https://github.com/google/gapid/blob/master/core/data/id/id_remap.go#L25-L48

.. code-block:: go

    // Remapper is an interface which allows remapping between ID to int64.
    // One such remapper can be stored in the current Context.
    // This is used to handle resource when converting to/from proto.
    // It needs to live here to break go package dependency cycles.
    type Remapper interface {
        RemapIndex(ctx context.Context, index int64) (ID, error)
        RemapID(ctx context.Context, id ID) (int64, error)
    }

    type remapperKeyTy string

    const remapperKey = remapperKeyTy("remapper")

    // GetRemapper returns the Remapper attached to the given context.
    func GetRemapper(ctx context.Context) Remapper {
        if val := ctx.Value(remapperKey); val != nil {
            return val.(Remapper)
        }
        panic("remapper missing from context")
    }

    // PutRemapper amends a Context by attaching a Remapper reference to it.
    func PutRemapper(ctx context.Context, d Remapper) context.Context {
        if val := ctx.Value(remapperKey); val != nil {
            panic("Context already holds remapper")
        }
        return context.WithValue(ctx, remapperKey, d)
    }

-------------------

.. code-block:: go

    type valueCtx struct {
        Context
        // (構造体の) key, val をフィールドとして保持
        key, val interface{}
    }

.. code-block:: go

    func WithValue(parent Context, key, val interface{}) Context {
        if key == nil {
            panic("nil key")
        }

        // 比較可能な型かどうかは以下を参照
        // https://golang.org/ref/spec#Comparison_operators
        if !reflectlite.TypeOf(key).Comparable() {
            panic("key is not comparable")
        }
        return &valueCtx{parent, key, val}
    }
