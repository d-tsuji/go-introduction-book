==========================
go quiz
==========================

Go quiz を解くメモです。クイズを解いて、Goへの理解を深めよう、という趣旨です。解説は資料にはついていないことが多いので、回答との行間を埋める意味もあります。

`Go理解度チェック 関数・ポインタ・スライス編 <https://docs.google.com/presentation/d/1oqfPIEJlw1u0GStHPEJFMtq2FPFUGDVSgMW2sLsXZF8/edit#slide=id.g7a74c7c8ae_0_298>`_
=========================================================================================================================================================================

.. code-block:: go
    :caption: #1

    package main

    func main() {
        as := []struct{ N int }{{N: 10}, {N: 20}}
        for _, a := range as {
            a.N *= 10
        }
        println(as[0].N, as[1].N)
    }

1 問目から間違えました。初見では ``100 200`` だと思ったけど違いました。これは slice をループでイテレーションすると、その一番目はindexで、二番目は、indexで示される要素の **コピー** を示します。Tour of Go にも書いてあります。

* https://tour.golang.org/moretypes/16

    When ranging over a slice, two values are returned for each iteration. The first is the index, and the second is a copy of the element at that index.

なので、for-range 文の中では要素が書き換わることがないために ``10 20`` と表示されます。

.. code-block:: go
    :caption: #2

    package main

    func main() {
        as := []*struct{ N int }{{N: 10}, {N: 20}}
        fs := make([]func(), len(as))
        for i := range as {
            fs[i] = func() { as[i].N *= 10 }
        }
        for _, f := range fs {
            f()
        }
        println(as[0].N, as[1].N)
    }

``10 2000`` で正解でした。``func() { as[i].N *= 10 }`` の中の ``i`` が何の値になっているか？ということがポイントのような気がします。 ``i`` はクロージャとして参照されているが、実際に呼び出されるときは ``i`` の値が ``1`` になっている(最後の参照を残している)ために ``10 2000`` と2つ目の要素が2回 ``*10`` されることになります。

.. code-block:: go
    :caption: #3

    package main

    func main() {
        var n int
        {
            n := n
            n += 100
        }
        println(n)
    }

間違えました。中括弧内での ``n := n`` として中括弧内のローカル変数に対して ``+100`` しているため、外側の ``n`` には影響がない例です。

.. code-block:: go
    :caption: #4

    package main

    func f(n int) { n = 100 }

    func main() {
        var n int
        f(n)
        println(n)
    }

正解でした。関数には値のコピーが渡されているため ``func f(n int) { n = 100 }`` の効果は関数内の ``n`` のみに閉じます。

.. code-block:: go
    :caption: #5

    package main

    func main() {
        var a struct{ N int }
        b := a
        a.N = 100
        println(b.N)
    }

正解でした。変数 ``b`` には ``a`` の変数のコピーを渡されるため ``b`` の宣言後に ``a`` の変数の値を変更したとしても ``b`` には影響がありません。

.. code-block:: go
    :caption: #6

    package main

    type A struct{ N int }
    func f(a A) { a.N = 100 }

    func main() {
        var a A
        f(a)
        println(a.N)
    }

正解でした。変数 ``a`` は関数 ``f`` に ``a`` の値のコピーとして渡されるため、呼び出し元に影響はありません。

.. code-block:: go
    :caption: #7

    package main

    func f(ns [2]int) {
        ns[0] = 100
    }

    func main() {
        var ns [2]int
        f(ns)
        println(ns[0])
    }

正解でした。配列も値のコピーが関数に渡されます。

.. code-block:: go
    :caption: #8

    package main

    func f(ns []int) {
        ns[0] = 100
    }

    func main() {
        var ns []int
        f(ns)
        println(ns[0])
    }

凡ミスしました。slice は宣言のみで初期化されていないために要素を更新しようとすると ``panic`` になります。

.. code-block:: go
    :caption: #9

    package main

    func f(ns []int) {
        ns = append(ns, 100)
    }

    func main() {
        var ns []int
        f(ns)
        println(len(ns))
    }

``1`` と思いましたが、間違えました。

.. code-block:: go
    :caption: #10

    package main

    func main() {
        a := []int{10, 20, 30}
        b := append(a, 40, 50)
        a[0] = 100
        c := append(b, 60, 70)
        b[1] = 200
        println(c[0] + c[1])
    }

``30`` かと思いましたが、違いました。