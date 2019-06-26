DBを扱う
============================================

`公式ドキュメント <https://golang.org/pkg/database/sql/#DB>`_ を参考にDBを扱う準備をします。今回はDriverとして `Postgres (pure Go) <https://github.com/lib/pq>`_ を用いることにします。

.. code-block:: none

    $ go get "github.com/lib/pq"

init関数を呼び出してimportします。

.. code-block:: go

    _ "github.com/lib/pq"


--------------------------------------------
レコードのSELECT
--------------------------------------------

まずはDB(PostgreSQL)のテーブルをselectしてみます。

.. code-block::

    import (
        "database/sql"
        "fmt"
        "log"

        _ "github.com/lib/pq"
    )

    func main() {
        connStr := "postgres://dev:dev@localhost/dev?sslmode=disable"
        db, err := sql.Open("postgres", connStr)
        if err != nil {
            log.Fatal(err)
        }

        relname := "pg_user"
        rows, err := db.Query("SELECT relname, relnamespace FROM pg_class WHERE relname = $1", relname)

        for rows.Next() {
            var rel string
            var relnamespace int
            if err := rows.Scan(&rel, &relnamespace); err != nil {
                log.Fatal(err)
            }
            fmt.Println(rel, relnamespace)
        }
        defer rows.Close()
    }
    // pg_user 11

想定通りレコードが取得できていることがわかりました。


--------------------------------------------
レコードのINSERT
--------------------------------------------

.. code-block::

    import (
        "database/sql"
        "log"

        _ "github.com/lib/pq"
    )

    func main() {
        connStr := "postgres://dev:dev@localhost/dev?sslmode=disable"
        db, err := sql.Open("postgres", connStr)
        if err != nil {
            log.Fatal(err)
        }

        statement := "INSERT INTO item (invoiceid, item, productid, quantity, cost) VALUES ($1, $2, $3, $4, $5)"
        res, err := db.Prepare(statement)
        if err != nil {
            log.Fatal(err)
        }

        defer res.Close()
        if _, err := res.Exec(49, 17, 24, 18, 10.8); err != nil {
            log.Fatal(err)
        }
    }

--------------------------------------------
レコードのUPDATE
--------------------------------------------

レコードのUPDATEはINSERTとほぼ同じです。

.. code-block::

    import (
        "database/sql"
        "log"

        _ "github.com/lib/pq"
    )

    func main() {
        connStr := "postgres://dev:dev@localhost/dev?sslmode=disable"
        db, err := sql.Open("postgres", connStr)
        if err != nil {
            log.Fatal(err)
        }

        statement := "UPDATE item SET cost = $1 WHERE invoiceid = $2 AND ITEM = $3"
        res, err := db.Prepare(statement)
        if err != nil {
            log.Fatal(err)
        }

        defer res.Close()
        if _, err := res.Exec(0.1, 49, 17); err != nil {
            log.Fatal(err)
        }
    }

--------------------------------------------
レコードのDELETE
--------------------------------------------

DELETEもINSERT(, UPDATE)とほぼ同様です。

.. code-block::

    import (
        "database/sql"
        "log"

        _ "github.com/lib/pq"
    )

    func main() {
        connStr := "postgres://dev:dev@localhost/dev?sslmode=disable"
        db, err := sql.Open("postgres", connStr)
        if err != nil {
            log.Fatal(err)
        }

        statement := "DELETE FROM item WHERE invoiceid = $1 AND ITEM = $2"
        res, err := db.Prepare(statement)
        if err != nil {
            log.Fatal(err)
        }

        defer res.Close()
        if _, err := res.Exec(49, 17); err != nil {
            log.Fatal(err)
        }
    }


--------------------------------------------
参考
--------------------------------------------

- https://golang.org/pkg/database/sql/#DB
- https://godoc.org/github.com/lib/pq