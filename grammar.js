const
  digitChar = /[0-9]/,
  identChars = /[a-zA-Z]+/,
  escapedChar = seq("\\", choice("n", "\\", "'", "\"" )),
  stringChars = /[^\n]*/,
  integerLit = /\d+/g,
  stringLit = choice(
    seq("\"", stringChars, "\""),
    seq("'", stringChars, "'"),
  ),
  numberLit = choice(
      seq(optional(seq(optional("-"), repeat1(digitChar))), ".", repeat1(digitChar)), // [ ["-"] { number } "." ] { number }
      seq(optional("."), repeat1(digitChar)),                                        // "." { number }
                                                                                    // -.1234 is not a valid number
  ),

  type = choice(
	 "ARRAY",
	 "BIGINT",
	 "BLOB",
	 "BOOL",
	 "BYTES",
	 "CHARACTER",
	 "DOCUMENT",
	 seq("DOUBLE", optional("PRECISION")),
	 "INT",
	 "INT2",
	 "INT8",
	 "INTEGER",
	 "MEDIUMINT",
	 "SMALLINT",
	 "TEXT",
	 "TINYINT",
	 "REAL",
	 seq("VARCHAR", optional(seq("(", /\d+/, ")"))),
  )

module.exports = grammar({
  name: 'genji',

  extras: $ => [/\s/],

  precedences: $ => [
    [
      'unary_not',
      'binary_times',
      'binary_plus',
      'binary_relation',
      'binary_and',
      'binary_or',
    ],
  ],

  rules: {
    source_file: $ => repeat1(seq( $._stmt, ";" )),

    _stmt: $ => choice(
      $.alter_stmt,
      $.begin_stmt,
      $.commit_stmt,
      $.select_stmt,
      $.delete_stmt,
      $.update_stmt,
      $.insert_stmt,
      $.create_stmt,
      $.drop_stmt,
      $.rollback_stmt,
      $.reindex_stmt,
    ),

    alter_stmt: $ => seq(
      "ALTER",
      "TABLE",
      $.ident,
      choice(
        "RENAME",
        "ADD",
      ),
    ),

    begin_stmt: $ => seq(
      "BEGIN",
      optional("TRANSACTION"),
      optional(seq("READ", choice("ONLY", "WRITE"))),
    ),

    commit_stmt: $ => seq(
      "COMMIT",
      optional("TRANSACTION"),
    ),

    select_stmt: $ => seq(
      "SELECT",
      optional("DISTINCT"),
      $.projection_exprs,
      optional(seq(
        "FROM",
        $.ident,
        optional(seq(
          "WHERE",
          $._expr,
        )),
        optional(seq(
          "GROUP",
          "BY",
          $._expr,
        )),
        optional(seq(
          "ORDER",
          "BY",
          choice("ASC", "DESC"),
        )),
        optional(seq(
          "LIMIT",
          $._expr,
        )),
        optional(seq(
          "OFFSET",
          $._expr
        )),
        optional(seq(
          "UNION",
          optional("ALL"),
          $.select_stmt)),
      )),
    ),

    delete_stmt: $ => seq(
      "DELETE",
      "FROM",
      $.ident,
      optional(seq(
        "WHERE",
        $._expr,
      )),
      optional(seq(
        "ORDER",
        "BY",
        choice("ASC", "DESC"),
      )),
      optional(seq(
        "LIMIT",
        $._expr,
      )),
      optional(seq(
        "OFFSET",
        $._expr
      )),
    ),

    update_stmt: $ => seq(
      "UPDATE",
      $.ident,
      choice(
        seq("SET",
          repeat(seq(
            $.path,
            "=",
            $._expr,
            ","
          )),
          seq(
            $.path,
            "=",
            $._expr,
          )
        ),
        seq("UNSET",
          repeat(seq(
            $.path,
            ",",
          )),
          $.path,
        ),
      ),
      optional(seq(
        "WHERE",
        $._expr,
      )),
    ),

    insert_stmt: $ => seq(
      "INSERT",
      "INTO",
      $.field_list,
      choice(
        seq("VALUES", $.values_list),
        $.select_stmt,
      ),
      // TODO ON CONFLICT
      optional(seq(
        "RETURNING",
        $.projection_exprs,
      )),
    ),

    create_stmt: $ => seq(
      "CREATE",
      choice(
        seq("TABLE"),
        seq("UNIQUE"),
        seq("INDEX"),
      ),
    ),

    drop_stmt: $ => seq(
      "DROP",
      choice("TABLE", "INDEX"),
      optional(seq("IF", "EXISTS")),
      $.ident,
    ),

    // TODO explain_stmt

    reindex_stmt: $ => seq(
      "REINDEX",
      $.ident,
    ),

    rollback_stmt: $ => seq(
      "ROLLBACK",
      optional("TRANSACTION"),
    ),

    ident: $ => choice(
      identChars,
      seq("`", stringChars, "`")
    ),

    number: $ => numberLit,
    string: $ => stringLit,
    bool: $ => choice("true", "false"),
    null: $ => "NULL",

    _expr: $ => choice(
      $.unary_expr,
      $.binary_expr,
      $.number,
      $.string,
      $.bool,
      $.null,
      $.ident,
      $.document,
      $.array,
    ),

    unary_expr: $ => choice(...[
      ["NOT", 'unary_not'],
      // [$.cast_expr, 'unary_not'],
      // [$.func_expr, 'unary_not'],
      // [$.named_param, 'unary_not'],
      // [$.positional_param, 'unary_not'],
    ].map(([operator, precedence]) =>
      prec.left(precedence, seq(
        field('operator', operator),
        field('argument', $._expr)
      ))
    )),

    cast_expr: $ => seq(
      "CAST",
      "(",
      $._expr,
      "AS",
      type,
      ")",
    ),

    func_expr: $ => choice(
      seq("COUNT", "(", "*", ")"), // special case
      seq($.ident,
        choice(
          seq("(", ")"), // no args
          seq(
            "(",
            repeat(seq(
              $._expr,
              ","
            )),
            $._expr,
            ")",
            ),
        ),
      ),
    ),

    projection_exprs: $ => choice(
      "*",
      seq($._expr, optional(seq("AS", $.ident))),
    ),

    values_list: $ => choice(
      seq("(", repeat(seq($._expr, ",")), $._expr, ")"),
      seq(choice(
        $.named_param,
        $.positional_param,
      )),
      $.document,
    ),

    field_list: $ => seq(
      "(",
        repeat(seq($.ident, ",")),
        $.ident,
      ")",
    ),

    binary_expr: $ => choice(
      ...[
        ['&&', 'binary_and'],
        ['||', 'binary_or'],
        ['&', 'binary_and'],
        ['^', 'binary_or'],
        ['|', 'binary_or'],
        ['+', 'binary_plus'],
        ['-', 'binary_plus'],
        ['*', 'binary_times'],
        ['/', 'binary_times'],
        ['%', 'binary_times'],
        ['<', 'binary_relation'],
        ['<=', 'binary_relation'],
        ['=', 'binary_relation'],
        ['!=', 'binary_relation'],
        ['>=', 'binary_relation'],
        ['>', 'binary_relation'],
        ['CONCAT', 'binary_relation'],
        ['LIKE', 'binary_relation'],
        [seq('NOT', 'LIKE'), 'binary_relation'],
        // ['BETWEEN', 'binary_relation'], // TODO
        ['IS', 'binary_relation'],
        ['IN', 'binary_relation'],
        [seq('NOT', 'IN'), 'binary_relation'],
        [seq('IS', "NOT"), 'binary_relation'],
      ].map(([operator, precedence]) =>
        prec.left(precedence, seq(
          field('left', $._expr),
          field('operator', operator),
          field('right', $._expr)
        ))
      )
    ),

    document: $ => choice(
      seq("{", "}"),
      seq(
      "{",
        repeat(seq($.kv_pair, ",")),
        $.kv_pair,
      "}",
      ),
    ),

    kv_pair: $ => seq(
      choice(
        stringLit,
        $.ident,
      ),
      ":",
      $._expr
    ),

    array: $ => choice(
      seq("[", "]"),
      seq(
      "[",
        repeat(seq($._expr, ",")),
        $._expr,
      "]",
      ),
    ),

    path: $ => seq(
      $.ident,
      repeat(choice(
        seq("[", integerLit, "]"),
        seq(".", $.ident),
      )),
    ),

    // TODO immediate, $ wfpwf is not valid
    named_param: $ => seq("$", $.ident),

    positional_param: $ => "?",

    comment: $ => token(choice(
      seq('--', /.*/),
      seq(
        '/*',
        /[^*]*\*+([^/*][^*]*\*+)*/,
        '/'
      )
    )),

    regex_pattern: $ => token.immediate(prec(-1,
      repeat1(choice(
        seq(
          '[',
            repeat(choice(
              seq('\\', /./),   // escaped character
              /[^\]\n\\]/       // any character besides ']' or '\n'
            )),
            ']'
        ),                      // square-bracket-delimited character class
        seq('\\', /./),         // escaped character
        /[^/\\\[\n]/            // any character besides '[', '\', '/', '\n'
      ))
    )),

    regex: $ => seq(
      '/',
      field('pattern', $.regex_pattern),
      token.immediate('/'),
    ),
  }
});
