演算子とデータ型
=========================

-------------------------
演算子
-------------------------

.. todo::

    演算子の説明を記載する

-------------------------
データ型
-------------------------

以下の基本的な型については省略。

-------------------------
基本型と複合型
-------------------------

-------------------------
型宣言
-------------------------

-------------------------
数値型
-------------------------

-------------------------
文字列型　
-------------------------

-------------------------
真偽値型
-------------------------

.. todo::

    省略した型の説明を記載する。

-------------------------
構造体型
-------------------------

struct はフィールドの集まりです。

.. code-block:: go

    type Vertex struct {
        x, y int
    }

    func main() {
        fmt.Println(Vertex{1, 2})
    }
    // {1 2}

フィールド値を指定して初期化することができます。

.. code-block:: go

    type Vertex struct {
        x, y int
    }

    func main() {
        fmt.Println(Vertex{y: 2, x: 1})
    }
    // {1 2}

-------------------------
ポインタ型
-------------------------

Goはポイントを扱います。ポインタの値はメモリアドレスを示します。

変数 T 型のポイントは &T 型で、ゼロ値は nil です。

* オペレータはポインタの指し示す変数を示します。

.. code-block:: go

    func main() {
        i := 1
        p := &i
        fmt.Println(p)
        fmt.Println(*p)
        
        var q *int
        fmt.Println(q)
    }
    // 0xc0420080b8
    // 1
    // <nil>

-------------------------
配列型
-------------------------

[n]T として T 型の n 個の配列を宣言することができます。配列の長さは型の一部分なので配列のサイズを変えることはできません。

.. code-block:: go

    func main() {
        var strs [10]string
        for i := 0; i < 10; i++ {
            strs[i] = strconv.Itoa(i)
        }
        
        for _, v := range strs {
            fmt.Print(v)
        }
    }
    // 0123456789

-------------------------
スライス型
-------------------------

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

-------------------------
マップ型
-------------------------

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

キーの存在チェック<br>
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

以下は省略

- その他の型
- リテラル

.. todo::

    - その他の型
    - リテラル

    省略した基本型について記載する。 

-------------------------
nil
-------------------------

nil は値がないことを示す特殊な値です。Javaでいうところの null と同じと考えて良いでしょう。nil は比較演算子 !=, == を用いて比較することができます。

-------------------------
型キャスト
-------------------------

.. todo::

    省略した型キャストについて記載する。 