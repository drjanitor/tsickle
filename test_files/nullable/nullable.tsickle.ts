
class Primitives {
  nullable: string|null;
  undefinable: number|undefined;
  nullableUndefinable: string|null|undefined;
  optional?: string;
}

// tsickle -> Closure type declarations
 /** @type {string} */
Primitives.prototype.nullable;
 /** @type {number} */
Primitives.prototype.undefinable;
 /** @type {string} */
Primitives.prototype.nullableUndefinable;
 /** @type {string} */
Primitives.prototype.optional;


class NonPrimitive {}

class NonPrimitives {
  nonNull: NonPrimitive;
  nullable: NonPrimitive|null;
  undefinable: NonPrimitive|undefined;
  nullableUndefinable: NonPrimitive|null|undefined;
  optional?: NonPrimitive;
}

// tsickle -> Closure type declarations
 /** @type {NonPrimitive} */
NonPrimitives.prototype.nonNull;
 /** @type {NonPrimitive} */
NonPrimitives.prototype.nullable;
 /** @type {NonPrimitive} */
NonPrimitives.prototype.undefinable;
 /** @type {NonPrimitive} */
NonPrimitives.prototype.nullableUndefinable;
 /** @type {NonPrimitive} */
NonPrimitives.prototype.optional;

