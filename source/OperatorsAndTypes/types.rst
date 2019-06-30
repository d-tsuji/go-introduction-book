データ型
===========================================

-------------------------------------------
値型
-------------------------------------------



-------------------------------------------
参照型
-------------------------------------------

Goには参照型というデータ型があります。

- slice(スライス)
- map(マップ)
- channel(チャネル)

が標準で参照型のデータ型になります。

参照型の生成に関しては make によって生成します。


==================  ===============  ===================================================
呼び出し形式            型T             意味
==================  ===============  ===================================================
make(T, n)           slice            要素数と容量が n である T 型のスライスを生成
make(T, n, m)        slice            要素数が n で容量が m である T 型のスライスを生成
make(T)              map              T 型のマップを生成
make(T, n)           map              T 型のマップを要素数 n をヒントにして生成
make(T)              channel          バッファのない T 型のチャネルを生成
make(T, n)           channel          バッファサイズ n の T 型のチャネルを生成
==================  ===============  ===================================================

スライス型
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

配列型では長さは固定長でしたが、スライスを用いると可変長の長さを扱うことができます。

[]T は T 型のスライスです。

.. code-block:: go

    func main() {
        var strs []string
        for i := 0; i < 10; i++ {
            strs = append(strs, strconv.Itoa(i))
        }
        fmt.Println(strs)
    }
    // [0 1 2 3 4 5 6 7 8 9]

要素の操作について、値型と参照型の違いを確認してみます。

.. code-block:: go
    :caption: NG例：値型である配列の値を操作

    func main() {
        a := [3]int{1, 2, 3}
        pow(a)
        fmt.Println(a)
    }

    func pow(a [3]int) {
        for i, v := range a {
            a[i] = v * v
        }
    }
    // [1 2 3]

pow(a) として関数に配列を渡したものの、関数としては引数の配列の値が **コピー** されて操作されているので、main から渡した引数には影響を及ぼしていません。配列型の要素に対して正しく操作するには以下のように記述する必要があります。

.. code-block:: go
    :caption: OK例：値型である配列の値をポインタで渡して操作

    func main() {
        a := &[3]int{1, 2, 3}
        pow(a)
        fmt.Println(a)
    }

    func pow(a *[3]int) {
        for i, v := range a {
            a[i] = v * v
        }
    }

    // &[1 4 9]

同じようでもスライス型の場合は参照型なので、関数の引数として渡した時に参照に対して関数が操作します。そのため、想定どおりスライスの値が変更されることがわかります。

.. code-block:: go
    :caption: OK例：スライスを操作

    func main() {
        a := []int{1, 2, 3}
        pow(a)
        fmt.Println(a)
    }

    func pow(a []int) {
        for i, v := range a {
            a[i] = v * v
        }
    }
    // [1 4 9]

マップ型
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

map[T]S で T型とS型のキーバリューを関連付けるmapを生成することができます。

make 関数は指定された型の、初期化され使用できるようにしたマップを返します。

.. code-block:: go

    func main() {
        var m = make(map[string]int)
        m["hoge"] = 1
        m["fuga"] = 2
        fmt.Println(m["hoge"])
    }
    // 1

マップ(m)に対して以下の操作ができます。

要素の挿入や更新

.. code-block:: go

    m[key] = value

要素の取得

.. code-block:: go

    value = m[key]

要素の削除

.. code-block:: go
    
    delete(m, key)

キーの存在チェック

要素を取得したときの第2引数にboolの要素でreturnされます。

.. code-block:: go
    
    value, ok = m[key]

.. code-block:: go

    func main() {
        m := make(map[string]int)

        m["Answer"] = 42
        fmt.Println("The value:", m["Answer"])

        m["Answer"] = 48
        fmt.Println("The value:", m["Answer"])

        delete(m, "Answer")
        fmt.Println("The value:", m["Answer"])

        v, ok := m["Answer"]
        fmt.Println("The value:", v, "Present?", ok)
    }
    // The value: 42
    // The value: 48
    // The value: 0
    // The value: 0 Present? false

チャネル型
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

チャネル( Channel )型は、チャネルオペレータの <- を用いて値の送受信ができる通り道です。同一プロセスのゴルーチン間での、通信・同期・値の共用、に使用します。GoのチャネルはFIFOキューに並行処理をしても正しく処理できることを保証する機能を組み合わせたものです。

Goならわかるシステムプログラミング [#]_ のよると、チャネルには以下の3つの性質があります。

    | チャネルは、データを順序よく受け渡すためのデータ構造である
    | チャネルは、並行処理されても正しくデータを受け渡す同期機構である
    | チャネルは、読み込み・書き込みの準備ができるまでブロックする機能である

チャネル型は chan です。

チャネルの送受信の書式は以下のようになります。

.. code-block:: go

    chan 要素型
    chan <- 送信する値 (送信専用チャネル)
    <- chan (受信専用チャネル)

チャネルの生成は以下のように宣言します。

.. code-block:: go

    make(chan 要素型)
    make(chan 要素型, キャパシティ)

チャネルを利用した送受信は以下のようになります。

.. code-block:: go

    チャネル <- 送信する値 // 送信
    <- チャネル // 受信


以下はchar <-string 型のチャネルを用いてメッセージをやりとりするサンプルです。

.. code-block:: go

    func main() {
        message := make(chan string, 10)

        go func(m chan<- string) {
            for i := 0; i < 5; i++ {
                if i%2 == 0 {
                    m <- "Ping "
                } else {
                    m <- "Pong "
                }
            }
            close(m)
            fmt.Println("func() finished.")
        }(message)

        for {
            time.Sleep(1 * time.Second)
            msg, ok := <-message
            if !ok {
                break
            }
            fmt.Print(msg)
        }
    }
    // func() finished.
    // Ping Pong Ping Pong Ping 

チャネルは、キャパシティの有無によって動作が変わってきます。バッファつきのチャネルの場合、送信側はバッファがある限りすぐに送信を完了して、次の処理を実行できます。一方、バッファなしのチャネルの場合、送信後、受信されないとそれまで処理がブロックされます。

先程の例でチャネル生成時に以下のようにバッファありのチャネルを生成していました。

.. code-block:: go

    message := make(chan string, 10)

これを以下のようにバッファなしのチャネルに変更してみます。

.. code-block:: go

    message := make(chan string)

送信側は受信側でチャネルから受信されるまでブロッキングされるので、出力される順序が変わることがわかります。

.. code-block:: go

    func main() {
        message := make(chan string)

        go func(m chan<- string) {
            for i := 0; i < 5; i++ {
                if i%2 == 0 {
                    m <- "Ping "
                } else {
                    m <- "Pong "
                }
            }
            close(m)
            fmt.Println("func() finished.")
        }(message)

        for {
            time.Sleep(1 * time.Second)
            msg, ok := <-message
            if !ok {
                break
            }
            fmt.Print(msg)
        }
    }
    // Ping Pong Ping Pong Ping func() finished.



.. [#] https://www.lambdanote.com/products/go