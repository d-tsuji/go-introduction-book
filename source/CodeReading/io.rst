============================================
io
============================================

io パッケージの役割は以下の2つ

* os パッケージなどの個別のI/O実装を抽象化する共通のインターフェース
* 関連するI/Oのラッパー

.. note::

    Groutineセーフではない

io.Reader
============================================

io.Readerは以下のシグネチャを持つReadメソッドを定義しているインターフェースです。``p byte[]`` は引数の読み取りした内容を一時的に格納しておくバッファです。

.. code-block:: go
    :caption: io.go

    type Reader interface {
        Read(p []byte) (n int, err error)
    }

`GoDoc <https://godoc.org/io#Reader>`_ のパッケージコメントから特徴(想定している仕様)を見てみます。

* 最大 len(p) バイトを読み取り、読み取ったバイト数nとエラーの有無を返却
* ``n < len(p)`` だったとしてもバッファ p はすべて使っている場合がある
* 最後まで読み込んだ場合、(err == EOF) または (err == 0) を返却することがある
* ``(0, nil)`` を返却することは非推奨。``(0, EOF)`` を返却する

要は **バイト列を読み取るためのインターフェース** です。読み取るものは、標準入力でも、ファイルでも、ソケット、バッファでもなんでもよくて、バイトのスライスを読み取ります。

例えば ``os.File`` や ``bytes.Buffer`` 構造体は ``Read(p []byte) (n int, err error)`` メソッドを実装しており ``io.Reader`` インターフェースを満たしています。

.. code-block:: go
    :caption: file.go

    // File represents an open file descriptor.
    type File struct {
        *file // os specific
    }

    // ...

    // Read reads up to len(b) bytes from the File.
    // It returns the number of bytes read and any error encountered.
    // At end of file, Read returns 0, io.EOF.
    func (f *File) Read(b []byte) (n int, err error) {
        if err := f.checkValid("read"); err != nil {
            return 0, err
        }
        n, e := f.read(b)
        return n, f.wrapErr("read", e)
    }

.. code-block:: go
    :caption: buffer.go

    // A Buffer is a variable-sized buffer of bytes with Read and Write methods.
    // The zero value for Buffer is an empty buffer ready to use.
    type Buffer struct {
        buf      []byte // contents are the bytes buf[off : len(buf)]
        off      int    // read at &buf[off], write at &buf[len(buf)]
        lastRead readOp // last read operation, so that Unread* can work correctly.
    }

    // ...

    // Read reads the next len(p) bytes from the buffer or until the buffer
    // is drained. The return value n is the number of bytes read. If the
    // buffer has no data to return, err is io.EOF (unless len(p) is zero);
    // otherwise it is nil.
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

実際どんな感じで ``Read`` メソッドが呼ばれているか ``ioutil/ioutil.go`` の ``ReadFile`` メソッドを見てみます。 ``ioutil.ReadFile`` はファイルからデータを読み取るときに使います。

.. code-block:: go
    :caption: ioutil/ioutil.go

    // ReadFile reads the file named by filename and returns the contents.
    // A successful call returns err == nil, not err == EOF. Because ReadFile
    // reads the whole file, it does not treat an EOF from Read as an error
    // to be reported.
    func ReadFile(filename string) ([]byte, error) {
        f, err := os.Open(filename)
        if err != nil {
            return nil, err
        }
        defer f.Close()
        // It's a good but not certain bet that FileInfo will tell us exactly how much to
        // read, so let's try it but be prepared for the answer to be wrong.
        var n int64 = bytes.MinRead

        if fi, err := f.Stat(); err == nil {
            // As initial capacity for readAll, use Size + a little extra in case Size
            // is zero, and to avoid another allocation after Read has filled the
            // buffer. The readAll call will read into its allocated internal buffer
            // cheaply. If the size was wrong, we'll either waste some space off the end
            // or reallocate as needed, but in the overwhelmingly common case we'll get
            // it just right.
            if size := fi.Size() + bytes.MinRead; size > n {
                n = size
            }
        }
        return readAll(f, n)
    }

    // ...

    // readAll reads from r until an error or EOF and returns the data it read
    // from the internal buffer allocated with a specified capacity.
    func readAll(r io.Reader, capacity int64) (b []byte, err error) {
        var buf bytes.Buffer
        // If the buffer overflows, we will get bytes.ErrTooLarge.
        // Return that as an error. Any other panic remains.
        defer func() {
            e := recover()
            if e == nil {
                return
            }
            if panicErr, ok := e.(error); ok && panicErr == bytes.ErrTooLarge {
                err = panicErr
            } else {
                panic(e)
            }
        }()
        if int64(int(capacity)) == capacity {
            buf.Grow(int(capacity))
        }
        _, err = buf.ReadFrom(r)
        return buf.Bytes(), err
    }

.. code-block:: go
    :caption: bytes/buffer.go

    // ReadFrom reads data from r until EOF and appends it to the buffer, growing
    // the buffer as needed. The return value n is the number of bytes read. Any
    // error except io.EOF encountered during the read is also returned. If the
    // buffer becomes too large, ReadFrom will panic with ErrTooLarge.
    func (b *Buffer) ReadFrom(r io.Reader) (n int64, err error) {
        b.lastRead = opInvalid
        for {
            i := b.grow(MinRead)
            b.buf = b.buf[:i]
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

個人的に良い実装だな、と思うのは ``readAll`` のシグネチャが以下のようになっていることです。``bytes.ReadFrom`` も同様。

.. code-block:: go

    readAll(r io.Reader, capacity int64) (b []byte, err error)

``readAll`` の第一引数は ``r io.Reader`` とインターフェースを受けるようになっています。これによって読み出す対象が何であるか気にする必要がなく ``io.Reader`` インターフェースを満たす構造体であれば何でも良くなります。``ReadAll`` メソッドのほうが分かりやすいかもしれません。HTTPのレスポンスボディを読み取るときによく使われる気がします。

.. code-block:: go

    ReadAll(r io.Reader) ([]byte, error)

--------------------------------------------

.. note::

    ちなみにファイル終端の EOF は以下のように実装されていました。たしかにエラーになっています。

    var EOF = errors.New("EOF")


io.Writer
============================================



参考
============================================

- https://qiita.com/ktnyt/items/8ede94469ba8b1399b12
