============================================
cob
============================================

モチベーション
============================================

* Go で cli を作りたい
* 軽量かつ良質な cli ツールのコードを読むことで cli の作り方のエッセンスを学ぶ
* Go の書き方のエッセンスを学ぶ

どんなツールなのか
============================================

`コミット前後でベンチマークが悪化していたらテストを落とすGoのCI用ツール <https://knqyf263.hatenablog.com/entry/2020/01/14/063941>`_ に書いてある。シュッと作ってあるのでソード全体が読める。

コードリーディング
============================================

コミット履歴を置いながらコードを追ってみることにする。コミット履歴を追わなくても、シンプルに master の main.go を読めばよい、という話でもある。

* https://github.com/knqyf263/cob/commit/3f485104260dcfd739d7596e0820ec89e50fbcea

cli は `urfave/cli <https://github.com/urfave/cli>`_ を使うと良いっぽい。他にもよく見る。こんな感じ。

.. code-block:: go

    package main

    import (
        "fmt"
        "log"
        "os"

        "github.com/urfave/cli/v2"
    )

    func main() {
        app := &cli.App{
            Name:  "cob",
            Usage: "Continuous Benchmark for Go project",
            Action: func(c *cli.Context) error {
                fmt.Println("hello world")
                return nil
            },
        }

        err := app.Run(os.Args)
        if err != nil {
            log.Fatal(err)
        }
    }
    // hello world

https://play.golang.org/p/bbcLV5goqE6

------------

* https://github.com/knqyf263/cob/commit/d0a7c0d9252ef6e686bae03c8c1e7785a4a79f92

実際に cli で動かしたいロジックを記述している

.. code-block:: go

    func run(c *cli.Context) error {
        args := []string{"test", "-bench"}
        args = append(args, c.Args().Slice()...)
        out, err := exec.Command("go", args...).Output()
        if err != nil {
            return err
        }

        b := bytes.NewBuffer(out)
        s, err := parse.ParseSet(b)
        if err != nil {
            return err
        }
        fmt.Println(s)
        return err
    }

------------

* https://github.com/knqyf263/cob/commit/451804a4214b2ca6bfc564dbe715055195b3380c

初期化時に config する項目を構造体にして別ファイルとして作成

.. code-block:: go
    :caption: config.go

    type config struct {
        args           []string
        onlyDegression bool
        threshold      float64
        bench          string
        benchmem       bool
        benchtime      string
    }

    func newConfig(c *cli.Context) config {
        return config{
            args:           c.Args().Slice(),
            onlyDegression: c.Bool("only-degression"),
            threshold:      c.Float64("threshold"),
            bench:          c.String("bench"),
            benchmem:       c.Bool("benchmem"),
            benchtime:      c.String("benchtime"),
        }
    }

フラグとして入力時に input する項目の設定

.. code-block:: go
    :caption: main.go

    Flags: []cli.Flag{
        &cli.BoolFlag{
            Name:  "only-degression",
            Usage: "Show only benchmarks with worse score",
        },
        &cli.Float64Flag{
            Name:  "threshold",
            Usage: "The program fails if the benchmark gets worse than the threshold",
            Value: 0.1,
        },
        &cli.StringFlag{
            Name:  "bench",
            Usage: "Run only those benchmarks matching a regular expression.",
            Value: ".",
        },
        &cli.BoolFlag{
            Name:  "benchmem",
            Usage: "Print memory allocation statistics for benchmarks.",
        },
        &cli.StringFlag{
            Name:  "benchtime",
            Usage: "Run enough iterations of each benchmark to take t, specified as a time.Duration (for example, -benchtime 1h30s).",
            Value: "1s",
        },

------

* https://github.com/knqyf263/cob/commit/239f2c4e3e0aeaad80c1e43c1619e44f4c5dd191

テストは `stretchr/testify <https://github.com/stretchr/testify>`_ を使っているみたい。``assert`` が便利ということだろうか。(使ったことがないのでわからない)

結果を出力するときに、最初は ``fmt.Println("...")`` を使っておいて、後から ``fmt.Fprintln(w, "...")`` とするのはリファクタリングのテクとしてありそう。呼び出し側で ``os.Stdout`` を渡せば同じ動作になる。

.. code-block:: diff
    :caption: main.go

    -func showResult(rows [][]string, benchmem bool) {
    -    fmt.Println("\nResult")
    -    fmt.Printf("%s\n\n", strings.Repeat("=", 6))
    +func showResult(w io.Writer, rows [][]string, benchmem bool) {
    +    fmt.Fprintln(w, "\nResult")
    +    fmt.Fprintf(w, "%s\n\n", strings.Repeat("=", 6))

    // ..

    -showResult(rows, c.benchmem)
    +showResult(os.Stdout, rows, c.benchmem)
