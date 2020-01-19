============================================
io
============================================

io パッケージの役割は以下の2つ

* I/Oプリミティブを抽象化する共通のインターフェース(osのファイルディスクリプタのioとか、バッファのioとか)
* 関連するI/Oのラッパー

.. note::

    必ずしもGroutineセーフではない

.. contents::
   :depth: 2

io.Reader (interface)
============================================

シグネチャ
--------------------------------------------

io.Readerは以下のシグネチャを持つReadメソッドを定義しているインターフェースです。``p byte[]`` は引数の読み取りした内容を一時的に格納しておくバッファです。

.. code-block:: go
    :caption: io.go

    type Reader interface {
        Read(p []byte) (n int, err error)
    }

ちなみに ``Read`` は非常にプリミティブなメソッドなので、通常直接このメソッドを扱うことは少なく、ラッパーの高級関数 (``ioutil.ReadAll, ioutil.ReadFile, bufio.Scanner``) を使うことが多いのではないでしょうか。

仕様
--------------------------------------------

`GoDoc <https://godoc.org/io#Reader>`_ のパッケージコメントから特徴(想定している仕様)を見てみます。

* 最大 ``len(p)`` バイトを読み取り、読み取ったバイト数 n とエラーを返却
* ``n < len(p)`` だったとしてもバッファ p をすべて使っている場合がある
* 非nilのエラーを返すか、次の呼び出しでエラーを返す(その時はn=0)
* ``(0, nil)`` を返却することは非推奨。``(0, nil)`` はEOFを示さない。終端まで読んだときは ``(0, EOF)`` を返す

要は **バイト列を読み取るためのインターフェース** です。読み取るものは、標準入力でも、ファイルでも、ソケット、バッファでもなんでもよいです。

実装
--------------------------------------------

例えば ``os.File`` や ``bytes.Buffer`` 構造体は ``Read(p []byte) (n int, err error)`` メソッドを実装しており ``io.Reader`` インターフェースを満たしています。(同時に io.Writer も満たしていることが多い)

.. code-block:: go
    :caption: os/file.go

    type File struct {
        *file // os specific
    }

    // ...

    // Readメソッドを実装しているので、io.Readerインターフェースを満たしている
    // ファイルから len(b) バイトを読み出す
    func (f *File) Read(b []byte) (n int, err error) {
        if err := f.checkValid("read"); err != nil {
            return 0, err
        }
        // 実際の読み込み処理は各OSのファイルのreadに移譲
        n, e := f.read(b)
        return n, f.wrapErr("read", e)
    }

.. code-block:: go
    :caption: bytes/buffer.go

    type Buffer struct {
        buf      []byte // データ buf[off : len(buf)] などと参照される
        off      int    // オフセット
        lastRead readOp
    }

    // ...

    // バッファから len(p) バイト読み出すか、バッファが空になるまで読む
    func (b *Buffer) Read(p []byte) (n int, err error) {
        b.lastRead = opInvalid
        if b.empty() {
            // Buffer is empty, reset to recover space.
            b.Reset()
            if len(p) == 0 {
                return 0, nil
            }
            return 0, io.EOF
        }
        n = copy(p, b.buf[b.off:])
        b.off += n
        if n > 0 {
            b.lastRead = opRead
        }
        return n, nil
    }


.. note:: 

    ちなみにメソッドのレシーバがポインタ型(\*T)だったけど、それで大丈夫？呼び出すときは型 T から呼び出しても大丈夫なの？という疑問があるかも知れません。私はそう思いました。

    結論から言うと大丈夫です。というよりもポインタに変換されて呼び出されます。まずGoの仕様として、あるタイプTのポインタ型(\*T)として宣言されているメソッドは、レシーバ \*T として宣言されたメソッドと T で宣言されたメソッドを含みます。また型 T の変数 t で宣言されたオブジェクトが t.x() のメソッドを呼び出すときに &t のメソッドとして x が含まれている場合は (&t).x() がGoのコンパイラによって変換されて呼び出されます。

    https://golang.org/ref/spec#Method_sets
    https://golang.org/ref/spec#Calls

実際どんな感じで ``io.Reader`` の ``Read`` メソッドが呼ばれているか ``ioutil/ioutil.go`` の ``ReadFile`` メソッドを見てみます。``ioutil.ReadFile`` はファイルからデータを読み取るときに使います。

.. code-block:: go
    :caption: ioutil/ioutil.go

    // ファイルからデータを読み出す
    // すべて読んだ場合は EOF error は返さず nil を返す
    func ReadFile(filename string) ([]byte, error) {
        f, err := os.Open(filename)
        if err != nil {
            return nil, err
        }
        defer f.Close()
        // ファイルからファイルサイズを取得するが正確でないことがある為
        // 512 バイトを余分に確保しておく。最低 512 バイト確保される
        var n int64 = bytes.MinRead

        if fi, err := f.Stat(); err == nil {
            if size := fi.Size() + bytes.MinRead; size > n {
                n = size
            }
        }
        return readAll(f, n)
    }

    // ...

    // io.Reader から EOF やエラーになるまでデータを読み取る
    func readAll(r io.Reader, capacity int64) (b []byte, err error) {
        var buf bytes.Buffer
        // バッファオーバーフローした場合のみpanicをrecoverしてbytes.ErrTooLargeのエラーとして返す
        // それ以外は panic を起こす
        defer func() {
            // 滅多に見ない recover() 関数
            e := recover()
            if e == nil {
                return
            }
            // panicが発生したエラーの型をチェックして、エラー型だった場合は、値を見て
            // bytes.ErrTooLarge("bytes.Buffer: too large")の場合はエラーとして回復
            if panicErr, ok := e.(error); ok && panicErr == bytes.ErrTooLarge {
                err = panicErr
            } else {
                panic(e)
            }
        }()
        if int64(int(capacity)) == capacity {
            buf.Grow(int(capacity))
        }
        // 内部的には bytes の ReadFrom が呼び出される
        _, err = buf.ReadFrom(r)
        return buf.Bytes(), err
    }

.. code-block:: go
    :caption: bytes/buffer.go

    // 最小のバッファサイズ(512バイト)
    const MinRead = 512

    // io.Reader から EOF までデータを読み取り、バッファに追加する
    // 必要に応じてバッファを拡張する
    // バッファが大きくなりすぎる場合は ErrTooLarge を返す
    func (b *Buffer) ReadFrom(r io.Reader) (n int64, err error) {
        b.lastRead = opInvalid

        // forループで終了条件 (io.EOF or error) に達するまで処理
        for {
            // *Bufferで保持している内部のバッファを割り当てるだけで十分であれば、拡張したスライスを返す
            // 足りなければ *buffer が保持しているバッファを元の大きさの約2倍に拡張する
            i := b.grow(MinRead)
            b.buf = b.buf[:i]

            // io.Reader を満たしている構造体の Read メソッドを呼び出す
            m, e := r.Read(b.buf[i:cap(b.buf)])
            if m < 0 {
                panic(errNegativeRead)
            }

            b.buf = b.buf[:i+m]
            n += int64(m)
            if e == io.EOF {
                return n, nil // e is EOF, so return nil explicitly
            }
            if e != nil {
                return n, e
            }
        }
    }

.. note::

    os.Openやos.Createで生成したos.File構造体はio.Readerを満たしており、Openした変数をそのままioutil.ReadAllに渡せるので、わざわざioutil.ReadFileがあるのはなんでだろうと思います。ファイルの場合は ``stat()`` などによりおおよそのファイルサイズがわかるため、バッファ領域の確保をより正確にするためと想定しています。

インターフェースを扱う
--------------------------------------------

個人的に良い実装だな、と思うのは ``ReadAll`` のシグネチャが以下のように ``io.Reader`` を受け取るようになっていることです。``readAll`` や ``bytes.ReadFrom``, ``bufio.NewReader`` も同様。

.. code-block:: go

    ReadAll(r io.Reader) ([]byte, error)

.. code-block:: go

    readAll(r io.Reader, capacity int64) (b []byte, err error)

.. code-block:: go

    ReadFrom(r io.Reader) (n int64, err error)

.. code-block:: go

    NewReader(rd io.Reader) *Reader  // bufio.Reader も io.Reader を満たしている


``ReadAll`` メソッドは ``r io.Reader`` とインターフェースを引数に取るようになっています。これによって読み出す対象が何であるか気にする必要がなく ``io.Reader`` インターフェースを満たす構造体であれば何でも受け取ることできます。ファイルを読みたい場合は ``ReadFile`` のようにラッパーとして実装すればよいだけでOKです。

.. note:: インターフェースを使った汎用的なデザインになっているのが良いと思っているのでGo特有というわけではない気がします。JavaだとInterfaceとかAbstractクラスとか使って実装する気がします。

上記のメソッド/関数の他にも、例えば json を扱う際の ``json.NewDecoder`` は以下のようになっていますし、独自にI/Oを扱う場合は ``io.Reader`` を受けとるようにすればよいのではないでしょうか。

.. code-block:: go

    func NewDecoder(r io.Reader) *Decoder {
        return &Decoder{r: r}
    }

独自の io.Reader を作る
--------------------------------------------

独自の io.Reader インターフェースを実装した myReader 構造体を作ってみます。

.. code-block:: go

    type myReader struct {
        content  []byte // 読み出す対象のバイト列
        position int    // 次に読むオフセット
    }

    func (r *myReader) Read(buf []byte) (int, error) {
        remainingBytes := len(r.content) - r.position
        n := min(remainingBytes, len(buf))
        if n == 0 {
            return 0, io.EOF
        }
        // copyはビルトイン関数
        copy(buf[:n], r.content[r.position:r.position+n])
        r.position += n
        return n, nil
    }

    func min(a int, b int) int {
        if a < b {
            return a
        }
        return b
    }

そうすると以下のように ``ioutil.ReadAll`` にわたすことができます。``io.Reader`` インターフェースを満たすだけで、``io.Reader`` を受け取る、ありとあらゆる関数を利用することができます。(以下のサンプル実装の場合はうれしみがないですが)

.. code-block:: go

    func main() {
        reader := &myReader{content: []byte("this is the stuff I'm reading")}
        bytes, err := ioutil.ReadAll(reader)
        if err != nil {
            log.Fatal(err)
        }
        fmt.Println(string(bytes))
    }
    // this is the stuff I'm reading

https://play.golang.org/p/xA1UdgJwwdv

--------------------------------------------

.. note::

    ちなみにファイル終端の EOF は以下のように実装されていました。たしかに error として定義されています。

    var EOF = errors.New("EOF")


io.Writer (interface)
============================================

シグネチャ
--------------------------------------------

``io.Writer`` も ``io.Reader`` に似ているインターフェースで以下の ``Write`` メソッドだけを持っているインターフェースです。なので、 ``Write`` メソッドを満たしていれば ``io.Writer`` になれます。

.. code-block:: go

    type Writer interface {
        Write(p []byte) (n int, err error)
    }

仕様
--------------------------------------------

* ``p`` から ``len(p)`` バイトを書き込み、書き込んだバイト数とエラーを返却する
* ``n < len(p)`` の場合は非nilのエラーの返却する必要がある

``io.Reader`` と比較すると仕様がシンプルです。

実装
--------------------------------------------

インターフェースを満たしている構造体の例を見てみます。例えば ``os.File`` は以下のように実装しています。

.. code-block:: go

    func (f *File) Write(b []byte) (n int, err error) {
        if err := f.checkValid("write"); err != nil {
            return 0, err
        }
        n, e := f.write(b)
        if n < 0 {
            n = 0
        }
        if n != len(b) {
            err = io.ErrShortWrite
        }

        epipecheck(f, e)

        if e != nil {
            err = f.wrapErr("write", e)
        }

        return n, err
    }

また ``bufio.Buffer`` では以下のように実装しています。

.. code-block:: go
    :caption: bufio/buffer.go

    func (b *Buffer) Write(p []byte) (n int, err error) {
        b.lastRead = opInvalid
        m, ok := b.tryGrowByReslice(len(p))
        if !ok {
            m = b.grow(len(p))
        }
        return copy(b.buf[m:], p), nil
    }


実際どんな感じで ``io.Writer`` の ``Write`` メソッドが呼ばれているか見てみます。

.. code-block:: go
    :caption: io/io.go

    func WriteString(w Writer, s string) (n int, err error) {
        if sw, ok := w.(StringWriter); ok {
            return sw.WriteString(s)
        }
        // 呼び出し元の構造体で実装している Write メソッドを呼び出す
        return w.Write([]byte(s))
    }

.. code-block:: go
    :caption: io/ioutil/ioutil.go

    func WriteFile(filename string, data []byte, perm os.FileMode) error {
        f, err := os.OpenFile(filename, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, perm)
        if err != nil {
            return err
        }
        // os.File構造体のWriteを呼び出す
        n, err := f.Write(data)
        if err == nil && n < len(data) {
            err = io.ErrShortWrite
        }
        if err1 := f.Close(); err == nil {
            err = err1
        }
        return err
    }

io.Copy (func)
============================================

インターフェースではないですが、``io.Copy`` も io パッケージの主要なメソッドの一つだと思うので取り上げます。

仕様
--------------------------------------------

* src から EOF に到達するかエラーが発生するまで dst にコピー
* コピーしたバイトするとエラーを返す

実装
--------------------------------------------

.. code-block:: go
    :caption: io/io.go

    func Copy(dst Writer, src Reader) (written int64, err error) {
        return copyBuffer(dst, src, nil)
    }

    func CopyBuffer(dst Writer, src Reader, buf []byte) (written int64, err error) {
        if buf != nil && len(buf) == 0 {
            panic("empty buffer in io.CopyBuffer")
        }
        return copyBuffer(dst, src, buf)
    }

    func copyBuffer(dst Writer, src Reader, buf []byte) (written int64, err error) {
        // If the reader has a WriteTo method, use it to do the copy.
        // Avoids an allocation and a copy.
        if wt, ok := src.(WriterTo); ok {
            return wt.WriteTo(dst)
        }
        // Similarly, if the writer has a ReadFrom method, use it to do the copy.
        if rt, ok := dst.(ReaderFrom); ok {
            return rt.ReadFrom(src)
        }
        if buf == nil {
            // デフォルトでは 32KB をバッファとして確保
            size := 32 * 1024
            if l, ok := src.(*LimitedReader); ok && int64(size) > l.N {
                if l.N < 1 {
                    size = 1
                } else {
                    size = int(l.N)
                }
            }
            buf = make([]byte, size)
        }
        for {
            nr, er := src.Read(buf)
            if nr > 0 {
                nw, ew := dst.Write(buf[0:nr])
                if nw > 0 {
                    written += int64(nw)
                }
                if ew != nil {
                    err = ew
                    break
                }
                if nr != nw {
                    err = ErrShortWrite
                    break
                }
            }
            if er != nil {
                if er != EOF {
                    err = er
                }
                break
            }
        }
        return written, err
    }

.. note::

    Go Conference で聞いた高度なテクニックですが、``sync.Pool`` でバッファを明示的に指定して io.Copy から io.CopyBuffer にしたところ、メモリ使用量が削減したという話もあります。

    https://github.com/src-d/go-git/pull/1179

    どちらかというと sync.Pool の性質(メモリに割り当てられている不要なアイテムをキャッシュし、後で再利用することで、 GC の負荷を下げる)を利用しているテクということだと思います。

copyするバイト数がわかっていれば、``CopyN`` で明示的にコピーするバイト数を指定することもできます。``io.Copy`` のラッパー。

.. code-block:: go

    func CopyN(dst Writer, src Reader, n int64) (written int64, err error) {
        // LimitReader は src の io.Reader から n バイトだけ読むこむ io.Reader を返却する関数
        written, err = Copy(dst, LimitReader(src, n))
        if written == n {
            return n, nil
        }
        if written < n && err == nil {
            err = EOF
        }
        return
    }

io.MultiWriter (func)
============================================

``io.MultiWriter`` は ``io.Writer`` のスライスを内部で保持していて、それぞれの ``io.Writer`` の ``Write`` メソッドを呼んでいました。デザインパターンでいうところのデコレータパターンらしいです。

.. code-block:: go
    :caption: io/multi.go

    func MultiWriter(writers ...Writer) Writer {
        allWriters := make([]Writer, 0, len(writers))
        for _, w := range writers {
            if mw, ok := w.(*multiWriter); ok {
                allWriters = append(allWriters, mw.writers...)
            } else {
                allWriters = append(allWriters, w)
            }
        }
        return &multiWriter{allWriters}
    }

    func (t *multiWriter) Write(p []byte) (n int, err error) {
        for _, w := range t.writers {
            n, err = w.Write(p)
            if err != nil {
                return
            }
            if n != len(p) {
                err = ErrShortWrite
                return
            }
        }
        return len(p), nil
    }

io.Pipe (func)
============================================

インメモリで io.Writer と io.Reader を同期的につなげるパイプの機能。内部でバッファリング **されない** のが特徴。シーケンシャルに読み書きされる。

.. code-block:: go
    :caption: io/pipe.go

    func Pipe() (*PipeReader, *PipeWriter) {
        p := &pipe{
            wrCh: make(chan []byte),
            rdCh: make(chan int),
            done: make(chan struct{}),
        }
        return &PipeReader{p}, &PipeWriter{p}
    }

    type pipe struct {
        wrMu sync.Mutex // Serializes Write operations
        wrCh chan []byte
        rdCh chan int

        once sync.Once // Protects closing done
        done chan struct{}
        rerr atomicError
        werr atomicError
    }

    type multiWriter struct {
        writers []Writer
    }

    type PipeWriter struct {
        p *pipe
    }

    // 書き込みの処理は pipe に移譲
    func (w *PipeWriter) Write(data []byte) (n int, err error) {
        return w.p.Write(data)
    }

    func (p *pipe) Write(b []byte) (n int, err error) {
        select {
        // done チャネルがクローズされている場合
        case <-p.done:
            return 0, p.writeCloseError()
        // そうでない場合はmutexでロックを取得
        default:
            p.wrMu.Lock()
            defer p.wrMu.Unlock()
        }

        // このスコープでの once の役割がよくわからない
        for once := true; once || len(b) > 0; once = false {
            select {
            // バイトスライスをチャネルに送信
            case p.wrCh <- b:
                // reader のチャネルから読み込んだint値を受信
                nw := <-p.rdCh
                // reader が読み込んだ文字数バイトスライスをすすめる
                b = b[nw:]
                n += nw
            case <-p.done:
                return n, p.writeCloseError()
            }
        }

        // 読んだ文字数を返却
        // n は名前付き変数の戻り値 (参考: https://golang.org/doc/effective_go.html#named-results)
        return n, nil
    }

    // クローズした場合はこれが呼ばれる
    func (p *pipe) CloseWrite(err error) error {
        if err == nil {
            err = EOF
        }
        p.werr.Store(err)
        // done チャネルのクローズ、sync.Onceなので複数のゴルーチンから同時に呼ばれたとしても一回きりしか呼ばれない
        p.once.Do(func() { close(p.done) })
        return nil
    }


その他
============================================

上記に上げた ``io.Reader`` や ``io.Writer`` 以外にも ``io.Closer`` ``io.Seeker`` があります。あとは埋め込みのインターフェースやその他の便利な関数などです。割愛します。

参考
============================================

* https://github.com/jesseduffield/notes/wiki/Golang-IO-Cookbook
* https://medium.com/@matryer/golang-advent-calendar-day-seventeen-io-reader-in-depth-6f744bb4320b
* https://qiita.com/ktnyt/items/8ede94469ba8b1399b12
