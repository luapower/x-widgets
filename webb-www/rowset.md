
## Features

* field attributes
	* class-based configuration: type
	* display: name, w, min_w, max_w, align, hidden, format
	* navigation: read_only
	* sorting: compare
	* editing: allow_null, convert, validate

* multi-row delta saving & reconciliation protocol
	* rejected inserts, updates, deletes
	* deleted updated rows
	* insert & update final values

	TODO: figure this out
		- changeset result:
			- I - rejected, err
			- I - inserterd, values
			- U - rejected, err, values
			- U - updated, values
			- U - not found
				- refresh dataset
				- insert instead
					- reuse old id or gen. new id?
				- delete or let the user delete it
					- don't mark it for deletion again
			- U - rejected, different values from last time
			- D - deleted or not found
			- D - rejected, err, values
		- put rejected deletes back into their original position
			- make it work with row reordering too
