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

``func WithCancel(parent Context) (ctx Context, cancel CancelFunc)``
----------------------------------------------------------------------------

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
        if p.children != nil {
            delete(p.children, child)
        }
        p.mu.Unlock()
    }

.. code-block:: go

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