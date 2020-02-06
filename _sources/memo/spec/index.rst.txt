==========================
spec
==========================

Goの仕様に関する、あるいは関するらしい事柄ではまったことをまとめていきたい

値型のみで構成される構造体は直接アドレスを取得できない
=====================================================================

以下のコードはコンパイルエラーになります。

.. code-block:: go

    package main

    type OnlyString string

    func main() {
        _ = OnlyString("hoge")

        // 以下はコンパイラエラーになる
        _ = &OnlyString("hoge")
    }

https://play.golang.org/p/A1pfwbljldj

直感的には ``string`` が値型なので値型のアドレスを取得することができないため、という理解です。がGoの以下の仕様を確認しました。

https://golang.org/ref/spec#Address_operators

    For an operand x of type T, the address operation &x generates a pointer of type \*T to x. The operand must be addressable, that is, either a variable, pointer indirection, or slice indexing operation; or a field selector of an addressable struct operand; or an array indexing operation of an addressable array. As an exception to the addressability requirement, x may also be a (possibly parenthesized) composite literal. If the evaluation of x would cause a run-time panic, then the evaluation of &x does too.

つまり ``&`` を用いてアドレスを取得できるのは以下の場合のみです。

* 変数
* ポインタ参照
* スライスのindex操作
* アドレス化可能な構造体のフィールド
* アドレス化可能な配列のindex操作

以下はいずれも有効なコードです。

変数
-------------------------------------------

.. code-block:: go

    package main

    import "fmt"

    type OnlyString string

    func main() {
        h := OnlyString("hoge")
        fmt.Println(&h)
    }

ポインタ参照
-------------------------------------------

.. code-block:: go

    package main

    import "fmt"

    func main() {
        s := "hoge"
        sp := &s
        fmt.Println(&sp)
    }

スライスのindex操作
-------------------------------------------

.. code-block:: go

    package main

    import "fmt"

    func main() {
        s := []int{1, 2, 3}
        fmt.Println(&s[0])
    }

アドレス化可能な構造体のフィールド
-------------------------------------------

.. code-block:: go

    package main

    import "fmt"

    type A struct {
        s string
    }

    type B struct {
        a A
    }

    func main() {
        b := &B{a: A{s: "foo"}}
        fmt.Println(b)
    }

アドレス化可能な配列のindex操作
-------------------------------------------

.. code-block:: go

    package main

    import "fmt"

    func main() {
        s := [3]int{1, 2, 3}
        fmt.Println(&s[0])
    }

エラーが無限ループする
=====================================================================

題材は A Tour of Go の  Exercise からです。

https://go-tour-jp.appspot.com/methods/20

以下は完全に正しいコードです。

.. code-block:: go

    package main

    import (
        "fmt"
    )

    type ErrNegativeSqrt float64

    func (e ErrNegativeSqrt) Error() string {
        return fmt.Sprintf("cannot Sqrt negative number: %v", float64(e))
    }

    func Sqrt(x float64) (float64, error) {
        if x < 0 {
            return 0, ErrNegativeSqrt(x)
        }
        z := 1.0
        for i := 0; i < 10; i++ {
            z -= (z*z - x) / (2 * z)
        }
        return z, nil
    }

    func main() {
        fmt.Println(Sqrt(2))
        fmt.Println(Sqrt(-2))
    }

上記のコードに1行変更を加えてみます。以下のコードは無限ループします。

.. code-block:: diff

    package main

    import (
        "fmt"
    )

    type ErrNegativeSqrt float64

    func (e ErrNegativeSqrt) Error() string {
    -    return fmt.Sprintf("cannot Sqrt negative number: %v", float64(e))
    +    return fmt.Sprintf("cannot Sqrt negative number: %v", e)
    }

    func Sqrt(x float64) (float64, error) {
        if x < 0 {
            return 0, ErrNegativeSqrt(x)
        }
        z := 1.0
        for i := 0; i < 10; i++ {
            z -= (z*z - x) / (2 * z)
        }
        return z, nil
    }

    func main() {
        fmt.Println(Sqrt(2))
        fmt.Println(Sqrt(-2))
    }

https://play.golang.org/p/tikMDE_Sq_R

.. code-block:: bash

    1.414213562373095 <nil>
    runtime: goroutine stack exceeds 250000000-byte limit
    fatal error: stack overflow

    runtime stack:
    runtime.throw(0x117172, 0xe)
        /usr/local/go/src/runtime/panic.go:774 +0x80
    runtime.newstack()
        /usr/local/go/src/runtime/stack.go:1046 +0x960
    runtime.morestack()
        /usr/local/go/src/runtime/asm_amd64p32.s:300 +0xc0
    ...

``Error()`` は ``string`` の呼び出しに等しいので、以下と言いかえられます。これも無限ループします。

.. code-block:: go

    type MyType struct {
        f float64
    }

    func (m MyType) String() string {
        return fmt.Sprintf("MyType: %v", m)
    }

    func main() {
        m := MyType{-1}
        fmt.Println(m)
    }
