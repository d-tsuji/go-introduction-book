並行処理
=================

-----------------
goroutine
-----------------

goroutine (ゴルーチン)は、Goのランタイムに管理される軽量なスレッドです。

go 関数 で goroutine として動作します。

並行して処理されていることがわかります。

.. code-block:: go

    func f() {
        for i := 0; i < 5; i++ {
            time.Sleep(1 * time.Second)
            fmt.Printf("%d ", i)
        }
    }

    func main() {
        go f()
        f()
    }
    // 0 0 1 1 2 2 3 3 4 4 

なお以下のようにすると main 関数の処理が終了してしまい、goroutine が動作中に関わらず処理が終了します。

.. code-block:: go

    func f() {
        for i := 0; i < 5; i++ {
            time.Sleep(1 * time.Second)
            fmt.Printf("%d ", i)
        }
    }

    func main() {
        go f()
        go f()
    }

-----------------
Channel
-----------------

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


-----------------
Select
-----------------

select は複数のチャネルに対して同時に送受信待ちを行うときに使用します。以下の例では、チャネルを通じてデータを送受信する場合に、データ送信用のチャネルとは別に、送受信が終わったことを示すチャネルを用いています。

.. code-block:: go

    func fibonacci(c, quit chan int) {
        x, y := 0, 1
        for {
            select {

            // (c)チャネルに値を送信
            case c <- x:
                x, y = y, x+y

                // (quit)チャネルから値を受信できるようになった場合は関数からreturnする
            case <-quit:
                fmt.Println("quit")
                return
            }
        }
    }

    func main() {
        c := make(chan int)
        quit := make(chan int)

        // 値の送受信をゴルーチンとして非同期処理する
        go func() {
            for i := 0; i < 10; i++ {
                // チャネルから値を受信
                // チャネルが空の場合は、チャネルに値が送信されるまでブロッキング
                fmt.Printf("%v ", <-c)
                time.Sleep(500 * time.Millisecond)
            }

            // quit チャネルに値を送信することでfibonacci関数からreturnさせる
            quit <- 0
        }()

        fibonacci(c, quit)
    }
    // 0 1 1 2 3 5 8 13 21 34 quit

-----------------
context
-----------------

コンテキストの簡単な例を見てみます。

.. code-block:: go

    func main() {

        fmt.Println("start func()")
        ctx, cancel := context.WithCancel(context.Background())
        go func() {
            for i := 0; i < 5; i++ {
                fmt.Printf("%v second passes\n", i)
                time.Sleep(1 * time.Second)
            }
            fmt.Println("func() is finished")
            cancel()
        }()
        <-ctx.Done()
        fmt.Println("all tasks are finished")
    }
    // start func()
    // 0 second passes
    // 1 second passes
    // 2 second passes
    // 3 second passes
    // 4 second passes
    // func() is finished
    // all tasks are finished

.. todo::

    コンテキストに関しては別で詳細を確認します。

.. [#] https://www.lambdanote.com/products/go